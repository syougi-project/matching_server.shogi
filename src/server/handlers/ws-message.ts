import { DomainError } from '@/lib/errors';
import type { ServerContext } from '@/server/context';
import type { WebSocketClientMessage, WebSocketServerMessage } from '@/types/protocol';
import { roleForUser } from '@/services/matchmaking';

export async function handleWebSocketMessage(
  context: ServerContext,
  connectionId: string,
  message: WebSocketClientMessage,
): Promise<WebSocketServerMessage> {
  try {
    switch (message.action) {
      case 'enter_queue': {
        const entry = await context.services.queue.enterQueue({
          userId: message.userId,
          connectionId,
          rating: message.rating,
          region: message.region,
          battleSetupId: message.battleSetupId,
        });
        return {
          type: 'queue_entered',
          requestId: message.requestId,
          status: 'waiting',
          queueEntryId: entry.queueEntryId,
          ratingBucket: entry.ratingBucket,
        };
      }
      case 'cancel_queue': {
        await context.services.queue.cancelQueue(message.userId);
        return {
          type: 'queue_cancelled',
          requestId: message.requestId,
          status: 'cancelled',
        };
      }
      case 'make_move': {
        const match = await context.services.gameCommand.makeMove({
          matchId: message.matchId,
          userId: message.userId,
          expectedVersion: message.expectedVersion,
          move: message.move,
        });
        return {
          type: 'game_state_updated',
          matchId: match.matchId,
          version: match.game.version,
          turn: match.game.turn,
          board: match.game.boardState,
          hands: match.game.handsState,
          lastMove: match.game.lastMove,
        };
      }
      case 'resign': {
        const match = await context.services.gameCommand.resign(message.matchId, message.userId);
        return {
          type: 'game_finished',
          matchId: match.matchId,
          status: 'finished',
          winnerUserId: match.winnerUserId,
          reason: match.endReason ?? 'unknown',
        };
      }
    }
  } catch (error) {
    if (error instanceof DomainError && error.code === 'VERSION_MISMATCH') {
      const match = await context.repositories.matches.findById(
        'matchId' in message ? message.matchId : '',
      );
      if (match) {
        return {
          type: 'state_resync_required',
          matchId: match.matchId,
          code: 'VERSION_MISMATCH',
          currentVersion: match.game.version,
        };
      }
    }

    const code = error instanceof DomainError ? error.code : 'INTERNAL_ERROR';
    const msg = error instanceof Error ? error.message : 'Unexpected error';
    return {
      type: 'error',
      requestId: 'requestId' in message ? message.requestId : undefined,
      code,
      message: msg,
    };
  }
}

export async function pollMatchmaking(context: ServerContext, userId: string) {
  const match = await context.services.matchmaking.runOnce();
  if (!match) return null;
  const role = roleForUser(match, userId);
  if (!role) return null;
  return {
    type: 'match_found' as const,
    matchId: match.matchId,
    role,
  };
}
