import type { MovePayload, PlayerSide } from '@/types/domain';

export type EnterQueueMessage = {
  action: 'enter_queue';
  requestId: string;
  userId: string;
  rating: number;
  region?: string;
  battleSetupId?: string;
};

export type CancelQueueMessage = {
  action: 'cancel_queue';
  requestId: string;
  userId: string;
};

export type MakeMoveMessage = {
  action: 'make_move';
  requestId: string;
  userId: string;
  matchId: string;
  expectedVersion: number;
  move: MovePayload;
};

export type ResignMessage = {
  action: 'resign';
  requestId: string;
  userId: string;
  matchId: string;
};

export type WebSocketClientMessage =
  | EnterQueueMessage
  | CancelQueueMessage
  | MakeMoveMessage
  | ResignMessage;

export type WebSocketServerMessage =
  | {
      type: 'queue_entered';
      requestId: string;
      status: 'waiting';
      queueEntryId: string;
      ratingBucket: number;
    }
  | {
      type: 'queue_cancelled';
      requestId: string;
      status: 'cancelled';
    }
  | {
      type: 'match_found';
      matchId: string;
      role: PlayerSide;
    }
  | {
      type: 'game_started';
      matchId: string;
      status: 'started';
      initialState: {
        turn: PlayerSide;
        board: Record<string, string>;
        hands: Record<PlayerSide, Record<string, number>>;
        version: number;
      };
    }
  | {
      type: 'game_state_updated';
      matchId: string;
      version: number;
      turn: PlayerSide;
      board: Record<string, string>;
      hands: Record<PlayerSide, Record<string, number>>;
      lastMove?: MovePayload;
    }
  | {
      type: 'game_finished';
      matchId: string;
      status: 'finished' | 'aborted';
      winnerUserId: string | null;
      reason: string;
    }
  | {
      type: 'state_resync_required';
      matchId: string;
      code: 'VERSION_MISMATCH';
      currentVersion: number;
    }
  | {
      type: 'opponent_disconnected';
      matchId: string;
      reconnectDeadlineAt: string;
    }
  | {
      type: 'opponent_reconnected';
      matchId: string;
    }
  | {
      type: 'error';
      requestId?: string;
      code: string;
      message: string;
    };

export type MatchFoundMessage = Extract<WebSocketServerMessage, { type: 'match_found' }>;
export type GameStartedMessage = Extract<WebSocketServerMessage, { type: 'game_started' }>;
export type GameStateUpdatedMessage = Extract<WebSocketServerMessage, { type: 'game_state_updated' }>;
export type GameFinishedMessage = Extract<WebSocketServerMessage, { type: 'game_finished' }>;
