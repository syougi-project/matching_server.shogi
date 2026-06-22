import { DomainError } from '@/lib/errors';
import type { ServerContext } from '@/server/context';
import type { WebSocketClientMessage, WebSocketServerMessage } from '@/types/protocol';
import { buildMatchFoundMessage, roleForUser } from '@/services/matchmaking';
import type { MatchSession } from '@/types/domain';
import type { GameStateUpdatedMessage } from '@/types/protocol';

export type WebSocketCommandResult = {
  response: WebSocketServerMessage;
  match: MatchSession | null;
  resendClockStarted?: boolean;
};

export function buildGameStateUpdatedMessage(match: MatchSession): GameStateUpdatedMessage {
  return {
    type: 'game_state_updated',
    matchId: match.matchId,
    version: match.game.version,
    turn: match.game.turn,
    board: match.game.boardState,
    hands: match.game.handsState,
    skillState: match.game.skillState,
    lastMove: match.game.lastMove,
    lastSkillTriggered: match.game.lastSkillTriggered,
    canonicalState: match.game.canonicalState,
  };
}

export function buildGameFinishedMessage(match: MatchSession) {
  return {
    type: 'game_finished' as const,
    matchId: match.matchId,
    status: match.status === 'aborted' ? ('aborted' as const) : ('finished' as const),
    winnerUserId: match.winnerUserId,
    reason: match.endReason ?? 'unknown',
  };
}

export async function handleWebSocketMessage(
  context: ServerContext,
  connectionId: string,
  message: WebSocketClientMessage,
): Promise<WebSocketServerMessage> {
  return (await handleWebSocketCommand(context, connectionId, message)).response;
}

export async function handleWebSocketCommand(
  context: ServerContext,
  connectionId: string,
  message: WebSocketClientMessage,
): Promise<WebSocketCommandResult> {
  try {
    switch (message.action) {
      case 'enter_queue': {
        const entry = await context.services.queue.enterQueue({
          userId: message.userId,
          displayName: message.displayName,
          connectionId,
          rating: message.rating,
          region: message.region,
          battleSetupId: message.battleSetupId,
        });
        return {
          response: {
            type: 'queue_entered',
            requestId: message.requestId,
            status: 'waiting',
            queueEntryId: entry.queueEntryId,
            ratingBucket: entry.ratingBucket,
          },
          match: null,
        };
      }
      case 'cancel_queue': {
        await context.services.queue.cancelQueue(message.userId);
        return {
          response: {
            type: 'queue_cancelled',
            requestId: message.requestId,
            status: 'cancelled',
          },
          match: null,
        };
      }
      case 'make_move': {
        const match = await context.services.gameCommand.makeMove({
          matchId: message.matchId,
          userId: message.userId,
          expectedVersion: message.expectedVersion,
          move: message.move,
        });
        return { response: buildGameStateUpdatedMessage(match), match };
      }
      case 'resign': {
        const match = await context.services.gameCommand.resign(message.matchId, message.userId);
        return {
          response: {
            type: 'game_finished',
            matchId: match.matchId,
            status: 'finished',
            winnerUserId: match.winnerUserId,
            reason: match.endReason ?? 'unknown',
          },
          match,
        };
      }
      case 'signal_battle_ready': {
        const { match, clockJustStarted, resendClockStarted } =
          await context.services.gameCommand.signalBattleReady(message.matchId, message.userId);
        return {
          response: {
            type: 'battle_ready_ack',
            matchId: match.matchId,
            requestId: message.requestId,
            clockStarted: clockJustStarted,
          },
          match,
          resendClockStarted,
        };
      }
      default: {
        const unknownMessage = message as { action?: unknown; requestId?: string };
        return {
          response: {
            type: 'error',
            requestId: unknownMessage.requestId,
            code: 'INVALID_ACTION',
            message: `Unknown action: ${String(unknownMessage.action ?? '')}`,
          },
          match: null,
        };
      }
    }
  } catch (error) {
    if (error instanceof DomainError && error.code === 'VERSION_MISMATCH') {
      const match = await context.services.gameCommand.findMatch(
        'matchId' in message ? message.matchId : '',
      );
      if (match) {
        return {
          response: {
            type: 'state_resync_required',
            matchId: match.matchId,
            code: 'VERSION_MISMATCH',
            currentVersion: match.game.version,
          },
          match,
        };
      }
    }

    const code = error instanceof DomainError ? error.code : 'INTERNAL_ERROR';
    const msg = error instanceof Error ? error.message : 'Unexpected error';
    return {
      response: {
        type: 'error',
        requestId: 'requestId' in message ? message.requestId : undefined,
        code,
        message: msg,
      },
      match: null,
    };
  }
}

export async function pollMatchmaking(context: ServerContext, userId: string) {
  const match = await context.services.matchmaking.runOnce();
  if (!match) return null;
  if (!roleForUser(match, userId)) return null;
  return buildMatchFoundMessage(match, userId);
}

export function profileFor(match: MatchSession, role: 'black' | 'white') {
  return role === 'black'
    ? match.playerBlackProfile
    : match.playerWhiteProfile;
}
