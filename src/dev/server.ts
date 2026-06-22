import type { ServerWebSocket } from 'bun';
import { createServerContext } from '@/server/context';
import { getHealth } from '@/server/handlers/health';
import { handleWebSocketCommand } from '@/server/handlers/ws-message';
import type { MatchSession } from '@/types/domain';
import { buildGameStateUpdatedMessage } from '@/server/handlers/ws-message';
import { buildBattleClockStartedMessage, isBattleClockStarted } from '@/lib/battle-clock';
import { DEV_BOT_USER_ID, isDevBotUserId } from '@/lib/dev-bot';
import { tryPlayDevBotMove } from '@/lib/dev-bot-autoplay';
import {
  cancelReconnectForfeitTimer,
  scheduleReconnectForfeitTimer,
} from '@/dev/reconnect-forfeit-timer';
import { buildMatchFoundMessage } from '@/services/matchmaking';
import { verifyMatchmakingTicket } from '@/lib/matchmaking-ticket';
import type {
  GameFinishedMessage,
  GameStartedMessage,
  GameStateUpdatedMessage,
  WebSocketClientMessage,
  WebSocketServerMessage,
} from '@/types/protocol';

type RuntimeState = {
  userIdByConnectionId: Map<string, string>;
  socketByUserId: Map<string, ServerWebSocket<RuntimeSocketData>>;
  matchIdByUserId: Map<string, string>;
  reconnectTimersByMatchId: Map<string, ReturnType<typeof setTimeout>>;
};

type RuntimeSocketData = {
  connectionId: string;
  userId: string;
  displayName: string;
  rating: number;
  requestedMatchId: string | null;
};

export function startLocalDevServer(port = 3010) {
  const context = createServerContext();
  if (!context.config.bffBaseUrl) {
    console.warn(
      '[matching_server] MATCHING_BFF_BASE_URL が未設定です。カスタムデッキは標準将棋盤になります。',
    );
  } else {
    console.log('[matching_server] BFF battle setup:', context.config.bffBaseUrl);
    if (process.env.MATCHING_USE_IN_MEMORY_CATALOG === 'true') {
      console.log(
        '[matching_server] MATCHING_USE_IN_MEMORY_CATALOG は設定されていますが、BFF 接続時は BFF 駒目録を使用します。',
      );
    }
  }
  if (isDevAutoBotEnabled()) {
    console.warn(
      '[matching_server] MATCHING_DEV_AUTO_BOT が有効です。相手不在時は CPU「練習相手」と自動マッチします。',
    );
  }
  const runtime: RuntimeState = {
    userIdByConnectionId: new Map(),
    socketByUserId: new Map(),
    matchIdByUserId: new Map(),
    reconnectTimersByMatchId: new Map(),
  };

  const selectedPort = port > 0 ? port : pickPortCandidate();
  let server: ReturnType<typeof Bun.serve<RuntimeSocketData>>;
  try {
    server = Bun.serve<RuntimeSocketData>({
      port: selectedPort,
      fetch(req, server) {
        const url = new URL(req.url);
        if (url.pathname === '/health') {
          return Response.json(getHealth());
        }

        if (url.pathname !== '/ws') {
          return new Response('Not found', { status: 404 });
        }

        const identity = resolveSocketIdentity(url, context.config.matchingTicketSecret ?? null);
        if (!identity) {
          return new Response('Missing or invalid identity', { status: 401 });
        }

        const connectionId = `conn_${Math.random().toString(36).slice(2, 10)}`;
        const requestedMatchId = url.searchParams.get('matchId')?.trim() || null;
        const upgraded = server.upgrade(req, {
          data: {
            connectionId,
            userId: identity.userId,
            displayName: identity.displayName,
            rating: identity.rating,
            requestedMatchId,
          },
        });

        return upgraded ? undefined : new Response('Upgrade failed', { status: 500 });
      },
      websocket: {
        async open(socket) {
          const userId = socket.data.userId;
          const connectionId = socket.data.connectionId;
          runtime.userIdByConnectionId.set(connectionId, userId);
          runtime.socketByUserId.set(userId, socket);

          const activeMatchId = socket.data.requestedMatchId;
          if (!activeMatchId) return;

          try {
            const match = await context.services.gameCommand.reconnect(activeMatchId, userId, connectionId);
            runtime.matchIdByUserId.set(userId, match.matchId);
            cancelReconnectForfeitTimer(runtime, match.matchId);
            socket.send(JSON.stringify(buildGameStateUpdatedMessage(match)));
            if (isBattleClockStarted(match)) {
              socket.send(JSON.stringify(buildBattleClockStartedMessage(match)));
            }
            await notifyOpponentReconnected(runtime, match, userId);
          } catch (error) {
            socket.send(JSON.stringify(toErrorMessage(undefined, error)));
          }
        },
        async message(socket, raw) {
          const text = typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
          let message: WebSocketClientMessage;
          try {
            message = JSON.parse(text) as WebSocketClientMessage;
          } catch {
            socket.send(
              JSON.stringify({
                type: 'error',
                code: 'INVALID_JSON',
                message: 'Message must be valid JSON',
              } satisfies WebSocketServerMessage),
            );
            return;
          }

          const trustedMessage = applySocketIdentity(message, socket.data);
          const commandResult = await handleWebSocketCommand(
            context,
            socket.data.connectionId,
            trustedMessage,
          );
          const response = commandResult.response;
          sendJson(socket, response);

          if (trustedMessage.action === 'enter_queue') {
            try {
              let match = await context.services.matchmaking.runOnce();
              if (!match && isDevAutoBotEnabled()) {
                match = await tryMatchWithDevBot(context, socket.data);
              }
              if (match) {
                runtime.matchIdByUserId.set(match.playerBlackUserId, match.matchId);
                runtime.matchIdByUserId.set(match.playerWhiteUserId, match.matchId);
                await broadcastMatchStarted(runtime, match);
              }
            } catch (error) {
              console.error('[matching_server] matchmaking failed after enter_queue', error);
              socket.send(JSON.stringify(toErrorMessage(trustedMessage.requestId, error)));
            }
            return;
          }

          if (trustedMessage.action === 'make_move' && response.type === 'game_state_updated') {
            const match = await context.repositories.matches.findById(response.matchId);
            if (match) {
              await publishHumanMoveUpdates(runtime, context, match, trustedMessage.userId);
            }
            return;
          }

          if (trustedMessage.action === 'resign' && response.type === 'game_finished') {
            const match = await context.repositories.matches.findById(response.matchId);
            if (match) {
              await broadcastToOpponent(runtime, match, trustedMessage.userId, response);
              await flushIntegrationOutbox(context);
            }
            return;
          }

          if (trustedMessage.action === 'signal_battle_ready' && response.type === 'battle_ready_ack') {
            if (!commandResult.match) return;
            if (response.clockStarted) {
              await broadcastToMatch(
                runtime,
                commandResult.match,
                buildBattleClockStartedMessage(commandResult.match),
              );
              const afterBot = await tryPlayDevBotMove(context, commandResult.match);
              if (afterBot) {
                await publishDevBotMoveUpdates(runtime, context, afterBot);
              }
              return;
            }
            if (commandResult.resendClockStarted) {
              sendJson(socket, buildBattleClockStartedMessage(commandResult.match));
            }
            return;
          }
        },
        async close(socket) {
          const { connectionId, userId } = socket.data;
          runtime.userIdByConnectionId.delete(connectionId);

          const currentSocket = runtime.socketByUserId.get(userId);
          if (currentSocket !== socket) {
            return;
          }
          runtime.socketByUserId.delete(userId);

          if (isDevBotUserId(userId)) {
            return;
          }

          const matchId = runtime.matchIdByUserId.get(userId);
          if (!matchId) {
            try {
              await context.services.queue.cancelQueue(userId);
            } catch {
              // Ignore close-time queue cleanup failures in local runtime.
            }
            return;
          }

          try {
            const match = await context.services.gameCommand.disconnect(matchId, userId);
            if (match.status === 'finished') {
              await broadcastToMatch(runtime, match, {
                type: 'game_finished',
                matchId: match.matchId,
                status: 'finished',
                winnerUserId: match.winnerUserId,
                reason: match.endReason ?? 'disconnect',
              });
              await flushIntegrationOutbox(context);
              return;
            }
            const deadline = match.reconnectDeadlineAt;
            if (!deadline) return;

            const opponentUserId =
              match.playerBlackUserId === userId ? match.playerWhiteUserId : match.playerBlackUserId;
            const opponent = runtime.socketByUserId.get(opponentUserId);
            opponent?.send(
              JSON.stringify({
                type: 'opponent_disconnected',
                matchId: match.matchId,
                reconnectDeadlineAt: deadline,
              } satisfies WebSocketServerMessage),
            );
            scheduleReconnectForfeitTimer(runtime, context, match, async (finished) => {
              await broadcastToMatch(runtime, finished, {
                type: 'game_finished',
                matchId: finished.matchId,
                status: 'finished',
                winnerUserId: finished.winnerUserId,
                reason: finished.endReason ?? 'disconnect',
              });
              await flushIntegrationOutbox(context);
            });
          } catch {
            // Ignore close-time disconnect failures in local runtime.
          }
        },
      },
    });
  } catch (error) {
    if (port <= 0 && error instanceof Error && String((error as any).code ?? '').includes('EADDRINUSE')) {
      return startLocalDevServer(0);
    }
    throw error;
  }

  return {
    port: server.port ?? selectedPort,
    stop() {
      server.stop(true);
    },
    server,
    context,
  };
}

async function publishHumanMoveUpdates(
  runtime: RuntimeState,
  context: ReturnType<typeof createServerContext>,
  match: MatchSession,
  actorUserId: string,
) {
  await broadcastToOpponent(
    runtime,
    match,
    actorUserId,
    buildGameStateUpdatedMessage(match),
  );
  if (match.status === 'finished') {
    await broadcastToMatch(runtime, match, {
      type: 'game_finished',
      matchId: match.matchId,
      status: 'finished',
      winnerUserId: match.winnerUserId,
      reason: match.endReason ?? 'king_capture',
    });
    await flushIntegrationOutbox(context);
    return;
  }

  const afterBot = await tryPlayDevBotMove(context, match);
  if (afterBot) {
    await publishDevBotMoveUpdates(runtime, context, afterBot);
  }
}

async function publishDevBotMoveUpdates(
  runtime: RuntimeState,
  context: ReturnType<typeof createServerContext>,
  match: MatchSession,
) {
  const humanUserId = isDevBotUserId(match.playerBlackUserId)
    ? match.playerWhiteUserId
    : match.playerBlackUserId;
  runtime.socketByUserId
    .get(humanUserId)
    ?.send(JSON.stringify(buildGameStateUpdatedMessage(match)));
  if (match.status === 'finished') {
    await broadcastToMatch(runtime, match, {
      type: 'game_finished',
      matchId: match.matchId,
      status: 'finished',
      winnerUserId: match.winnerUserId,
      reason: match.endReason ?? 'king_capture',
    });
    await flushIntegrationOutbox(context);
  }
}

async function broadcastMatchStarted(runtime: RuntimeState, match: MatchSession) {
  const blackSocket = runtime.socketByUserId.get(match.playerBlackUserId);
  const whiteSocket = runtime.socketByUserId.get(match.playerWhiteUserId);
  if (!blackSocket && !whiteSocket) {
    console.warn('[matching_server] match created but no websocket available for broadcast', {
      matchId: match.matchId,
    });
    return;
  }

  const blackFound = buildMatchFoundMessage(match, match.playerBlackUserId);
  const whiteFound = buildMatchFoundMessage(match, match.playerWhiteUserId);
  const started: GameStartedMessage = {
    type: 'game_started',
    matchId: match.matchId,
    status: 'started',
    initialState: {
      turn: match.game.turn,
      board: match.game.boardState,
      hands: match.game.handsState,
      skillState: match.game.skillState,
      version: match.game.version,
      canonicalState: match.game.canonicalState,
    },
  };

  if (blackSocket) {
    blackSocket.send(JSON.stringify(blackFound));
    blackSocket.send(JSON.stringify(started));
  }
  if (whiteSocket) {
    whiteSocket.send(JSON.stringify(whiteFound));
    whiteSocket.send(JSON.stringify(started));
  }
}

function isDevAutoBotEnabled() {
  const raw = process.env.MATCHING_DEV_AUTO_BOT?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

async function tryMatchWithDevBot(
  context: ReturnType<typeof createServerContext>,
  identity: RuntimeSocketData,
) {
  if (isDevBotUserId(identity.userId)) return null;

  const humanEntry = await context.repositories.queue.findActiveByUserId(identity.userId);

  await context.services.queue.cancelQueue(DEV_BOT_USER_ID).catch(() => undefined);
  await context.services.queue.enterQueue({
    userId: DEV_BOT_USER_ID,
    displayName: '練習相手',
    connectionId: `dev_bot_${Date.now()}`,
    rating: identity.rating,
    battleSetupId: humanEntry?.battleSetupId ?? undefined,
  });

  console.log('[matching_server] dev auto-bot entered queue for', identity.userId);
  return context.services.matchmaking.runOnce();
}

async function broadcastToMatch(
  runtime: RuntimeState,
  match: MatchSession,
  message: GameStateUpdatedMessage | GameFinishedMessage | WebSocketServerMessage,
) {
  runtime.socketByUserId.get(match.playerBlackUserId)?.send(JSON.stringify(message));
  runtime.socketByUserId.get(match.playerWhiteUserId)?.send(JSON.stringify(message));
}

async function broadcastToOpponent(
  runtime: RuntimeState,
  match: MatchSession,
  actorUserId: string,
  message: GameStateUpdatedMessage | GameFinishedMessage,
) {
  const opponentUserId =
    match.playerBlackUserId === actorUserId ? match.playerWhiteUserId : match.playerBlackUserId;
  runtime.socketByUserId.get(opponentUserId)?.send(JSON.stringify(message));
}

async function notifyOpponentReconnected(
  runtime: RuntimeState,
  match: MatchSession,
  userId: string,
) {
  const opponentUserId =
    match.playerBlackUserId === userId ? match.playerWhiteUserId : match.playerBlackUserId;
  runtime.socketByUserId.get(opponentUserId)?.send(
    JSON.stringify({
      type: 'opponent_reconnected',
      matchId: match.matchId,
    } satisfies WebSocketServerMessage),
  );
}

function sendJson(socket: ServerWebSocket<RuntimeSocketData>, payload: unknown): void {
  const text = JSON.stringify(payload);
  if (!text) {
    console.warn('[matching_server] skipped empty websocket payload', payload);
    return;
  }
  socket.send(text);
}

async function flushIntegrationOutbox(context: ReturnType<typeof createServerContext>) {
  try {
    await context.services.outboxWorker.runOnce();
  } catch (error) {
    console.warn(
      '[matching_server] failed to flush integration outbox:',
      error instanceof Error ? error.message : error,
    );
  }
}

function toErrorMessage(requestId: string | undefined, error: unknown): WebSocketServerMessage {
  return {
    type: 'error',
    requestId,
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : 'Unexpected error',
  };
}

function resolveSocketIdentity(
  url: URL,
  ticketSecret: string | null,
): Pick<RuntimeSocketData, 'userId' | 'displayName' | 'rating'> | null {
  const ticket = url.searchParams.get('ticket')?.trim();
  if (ticket && ticketSecret) {
    try {
      const claims = verifyMatchmakingTicket(ticket, ticketSecret);
      return {
        userId: claims.userId,
        displayName: claims.displayName,
        rating: claims.rating,
      };
    } catch {
      return null;
    }
  }

  const userId = url.searchParams.get('userId')?.trim();
  if (!userId) return null;
  return {
    userId,
    displayName: url.searchParams.get('displayName')?.trim() || userId,
    rating: Number(url.searchParams.get('rating') ?? '0') || 0,
  };
}

function applySocketIdentity(
  message: WebSocketClientMessage,
  identity: RuntimeSocketData,
): WebSocketClientMessage {
  if (message.action === 'enter_queue') {
    return {
      ...message,
      userId: identity.userId,
      displayName: message.displayName ?? identity.displayName,
      rating: Number.isFinite(message.rating) && message.rating > 0 ? message.rating : identity.rating,
    };
  }
  return { ...message, userId: identity.userId };
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? '3010');
  const ticketSecret = process.env.MATCHING_TICKET_SECRET?.trim();
  if (ticketSecret?.includes('<') || ticketSecret?.includes('bff.shogi')) {
    console.warn(
      '[matching_server] MATCHING_TICKET_SECRET がプレースホルダーのままです。' +
        ' PowerShell で設定した $env:MATCHING_* を削除するか、新しいターミナルで bun run dev:ws を起動してください。',
    );
  }
  startLocalDevServer(port);
  console.log(`[matching_server] local websocket server listening on ws://localhost:${port}/ws`);
}

function pickPortCandidate() {
  return 3100 + Math.floor(Math.random() * 400);
}
