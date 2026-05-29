import type { ServerWebSocket } from 'bun';
import { createServerContext } from '@/server/context';
import { getHealth } from '@/server/handlers/health';
import { handleWebSocketMessage } from '@/server/handlers/ws-message';
import type { MatchSession } from '@/types/domain';
import { buildGameStateUpdatedMessage } from '@/server/handlers/ws-message';
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
  const runtime: RuntimeState = {
    userIdByConnectionId: new Map(),
    socketByUserId: new Map(),
    matchIdByUserId: new Map(),
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
            socket.send(JSON.stringify(buildGameStateUpdatedMessage(match)));
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
          const response = await handleWebSocketMessage(context, socket.data.connectionId, trustedMessage);
          socket.send(JSON.stringify(response));

          if (trustedMessage.action === 'enter_queue') {
            const match = await context.services.matchmaking.runOnce();
            if (match) {
              runtime.matchIdByUserId.set(match.playerBlackUserId, match.matchId);
              runtime.matchIdByUserId.set(match.playerWhiteUserId, match.matchId);
              await broadcastMatchStarted(runtime, match);
            }
            return;
          }

          if (trustedMessage.action === 'make_move' && response.type === 'game_state_updated') {
            const match = await context.repositories.matches.findById(response.matchId);
            if (match) {
              await broadcastToMatch(runtime, match, buildGameStateUpdatedMessage(match));
            }
            return;
          }

          if (trustedMessage.action === 'resign' && response.type === 'game_finished') {
            const match = await context.repositories.matches.findById(response.matchId);
            if (match) {
              await broadcastToMatch(runtime, match, response);
            }
          }
        },
        async close(socket) {
          const { connectionId, userId } = socket.data;
          runtime.userIdByConnectionId.delete(connectionId);
          runtime.socketByUserId.delete(userId);

          const matchId = runtime.matchIdByUserId.get(userId);
          if (!matchId) return;

          try {
            const match = await context.services.gameCommand.disconnect(matchId, userId);
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

async function broadcastMatchStarted(runtime: RuntimeState, match: MatchSession) {
  const blackSocket = runtime.socketByUserId.get(match.playerBlackUserId);
  const whiteSocket = runtime.socketByUserId.get(match.playerWhiteUserId);
  if (!blackSocket || !whiteSocket) return;

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
      version: match.game.version,
      canonicalState: match.game.canonicalState,
    },
  };

  blackSocket.send(JSON.stringify(blackFound));
  whiteSocket.send(JSON.stringify(whiteFound));
  blackSocket.send(JSON.stringify(started));
  whiteSocket.send(JSON.stringify(started));
}

async function broadcastToMatch(
  runtime: RuntimeState,
  match: MatchSession,
  message: GameStateUpdatedMessage | GameFinishedMessage,
) {
  runtime.socketByUserId.get(match.playerBlackUserId)?.send(JSON.stringify(message));
  runtime.socketByUserId.get(match.playerWhiteUserId)?.send(JSON.stringify(message));
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
  startLocalDevServer(port);
  console.log(`[matching_server] local websocket server listening on ws://localhost:${port}/ws`);
}

function pickPortCandidate() {
  return 3100 + Math.floor(Math.random() * 400);
}
