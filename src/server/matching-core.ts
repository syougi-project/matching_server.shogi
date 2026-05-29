import type { ServerContext } from '@/server/context';
import { buildGameStateUpdatedMessage } from '@/server/handlers/ws-message';
import { handleWebSocketMessage, profileFor } from '@/server/handlers/ws-message';
import type { MatchSession } from '@/types/domain';
import type {
  GameFinishedMessage,
  GameStartedMessage,
  MatchFoundMessage,
  WebSocketClientMessage,
  WebSocketServerMessage,
} from '@/types/protocol';

export class MatchingCore {
  constructor(private readonly context: ServerContext) {}

  async handleClientMessage(connectionId: string, message: WebSocketClientMessage) {
    const response = await handleWebSocketMessage(this.context, connectionId, message);
    const broadcasts: Array<{ userId: string; message: WebSocketServerMessage }> = [];

    if (message.action === 'enter_queue') {
      const match = await this.context.services.matchmaking.runOnce();
      if (match) {
        broadcasts.push(...buildMatchStartedBroadcasts(match));
      }
      return { response, broadcasts, match };
    }

    if (message.action === 'make_move' && response.type === 'game_state_updated') {
      const match = await this.context.repositories.matches.findById(response.matchId);
      if (match) {
        const update = buildGameStateUpdatedMessage(match);
        broadcasts.push(
          { userId: match.playerBlackUserId, message: update },
          { userId: match.playerWhiteUserId, message: update },
        );
      }
      return { response, broadcasts, match };
    }

    if (message.action === 'resign' && response.type === 'game_finished') {
      const match = await this.context.repositories.matches.findById(response.matchId);
      if (match) {
        broadcasts.push(
          { userId: match.playerBlackUserId, message: response },
          { userId: match.playerWhiteUserId, message: response },
        );
      }
      return { response, broadcasts, match };
    }

    return { response, broadcasts, match: null };
  }

  async reconnect(matchId: string, userId: string, connectionId: string) {
    const match = await this.context.services.gameCommand.reconnect(matchId, userId, connectionId);
    return {
      match,
      response: buildGameStateUpdatedMessage(match),
      opponentMessage: {
        type: 'opponent_reconnected',
        matchId: match.matchId,
      } satisfies WebSocketServerMessage,
    };
  }

  async disconnect(matchId: string, userId: string) {
    const match = await this.context.services.gameCommand.disconnect(matchId, userId);
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
