import type { ServerContext } from '@/server/context';
import type { MatchmakingRequestPublisher } from '@/integrations/matchmaking-request-publisher';
import {
  buildGameFinishedMessage,
  buildGameStateUpdatedMessage,
} from '@/server/handlers/ws-message';
import { handleWebSocketCommand, profileFor } from '@/server/handlers/ws-message';
import { buildBattleClockStartedMessage, isBattleClockStarted } from '@/lib/battle-clock';
import type { MatchSession } from '@/types/domain';
import type {
  GameFinishedMessage,
  GameStartedMessage,
  MatchFoundMessage,
  WebSocketClientMessage,
  WebSocketServerMessage,
} from '@/types/protocol';

export class MatchingCore {
  constructor(
    private readonly context: ServerContext,
    private readonly matchmakingRequests: MatchmakingRequestPublisher | null = null,
  ) {}

  async handleClientMessage(connectionId: string, message: WebSocketClientMessage) {
    const { response, match, resendClockStarted } = await handleWebSocketCommand(
      this.context,
      connectionId,
      message,
    );
    const broadcasts: Array<{ userId: string; message: WebSocketServerMessage }> = [];

    if (message.action === 'enter_queue') {
      if (response.type === 'queue_entered') {
        await this.requestMatchmaking(response.queueEntryId, response.ratingBucket);
      }
      return { response, broadcasts, match: null };
    }

    if (message.action === 'make_move' && response.type === 'game_state_updated') {
      if (match) {
        const update = buildGameStateUpdatedMessage(match);
        const opponentUserId =
          message.userId === match.playerBlackUserId
            ? match.playerWhiteUserId
            : match.playerBlackUserId;
        broadcasts.push({ userId: opponentUserId, message: update });
        if (match.status === 'finished') {
          const finished = buildGameFinishedMessage(match);
          broadcasts.push({ userId: match.playerBlackUserId, message: finished });
          broadcasts.push({ userId: match.playerWhiteUserId, message: finished });
        }
      }
      return { response, broadcasts, match };
    }

    if (message.action === 'resign' && response.type === 'game_finished') {
      if (match) {
        const opponentUserId =
          message.userId === match.playerBlackUserId
            ? match.playerWhiteUserId
            : match.playerBlackUserId;
        broadcasts.push({ userId: opponentUserId, message: response });
      }
      return { response, broadcasts, match };
    }

    if (message.action === 'signal_battle_ready' && response.type === 'battle_ready_ack') {
      if (match && (response.clockStarted || resendClockStarted)) {
        const clockStarted = buildBattleClockStartedMessage(match);
        if (response.clockStarted) {
          broadcasts.push({ userId: match.playerBlackUserId, message: clockStarted });
          broadcasts.push({ userId: match.playerWhiteUserId, message: clockStarted });
        } else {
          broadcasts.push({ userId: message.userId, message: clockStarted });
        }
      }
      return { response, broadcasts, match };
    }

    return { response, broadcasts, match: null };
  }

  private async requestMatchmaking(queueEntryId: string, ratingBucket: number) {
    if (!this.matchmakingRequests) return;
    try {
      await this.matchmakingRequests.requestMatchmaking({ queueEntryId, ratingBucket });
    } catch (error) {
      console.error(
        '[matching_server] failed to enqueue matchmaking request:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  async reconnect(matchId: string, userId: string, connectionId: string) {
    const match = await this.context.services.gameCommand.reconnect(matchId, userId, connectionId);
    const reconnectMessages: WebSocketServerMessage[] = [buildGameStateUpdatedMessage(match)];
    if (isBattleClockStarted(match)) {
      reconnectMessages.push(buildBattleClockStartedMessage(match));
    }
    return {
      match,
      response: reconnectMessages[0],
      extraResponses: reconnectMessages.slice(1),
      opponentMessage: {
        type: 'opponent_reconnected',
        matchId: match.matchId,
      } satisfies WebSocketServerMessage,
    };
  }

  async disconnect(matchId: string, userId: string) {
    const match = await this.context.services.gameCommand.disconnect(matchId, userId);
    if (match.status === 'finished') {
      return {
        match,
        opponentMessage: {
          type: 'game_finished',
          matchId: match.matchId,
          status: 'finished',
          winnerUserId: match.winnerUserId,
          reason: match.endReason ?? 'disconnect',
        } satisfies WebSocketServerMessage,
      };
    }
    if (!match.reconnectDeadlineAt) return { match, opponentMessage: null };
    return {
      match,
      opponentMessage: {
        type: 'opponent_disconnected',
        matchId: match.matchId,
        reconnectDeadlineAt: match.reconnectDeadlineAt,
      } satisfies WebSocketServerMessage,
    };
  }
}

export function buildMatchStartedBroadcasts(match: MatchSession) {
  const blackFound: MatchFoundMessage = {
    type: 'match_found',
    matchId: match.matchId,
    role: 'black',
    self: profileFor(match, 'black'),
    opponent: profileFor(match, 'white'),
  };
  const whiteFound: MatchFoundMessage = {
    type: 'match_found',
    matchId: match.matchId,
    role: 'white',
    self: profileFor(match, 'white'),
    opponent: profileFor(match, 'black'),
  };
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

  return [
    { userId: match.playerBlackUserId, message: blackFound },
    { userId: match.playerWhiteUserId, message: whiteFound },
    { userId: match.playerBlackUserId, message: started },
    { userId: match.playerWhiteUserId, message: started },
  ];
}

export function buildMatchBroadcasts(
  match: MatchSession,
  message: ReturnType<typeof buildGameStateUpdatedMessage> | GameFinishedMessage,
) {
  return [
    { userId: match.playerBlackUserId, message },
    { userId: match.playerWhiteUserId, message },
  ];
}
