import type { MatchingCanonicalState } from '@/types/canonical-state';
import type { MovePayload, PlayerSide } from '@/types/domain';

export type MatchPlayerProfile = {
  userId: string;
  displayName: string;
  rating: number;
};

export type EnterQueueMessage = {
  action: 'enter_queue';
  requestId: string;
  userId: string;
  rating: number;
  displayName?: string;
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

export type SignalBattleReadyMessage = {
  action: 'signal_battle_ready';
  requestId: string;
  userId: string;
  matchId: string;
};

export type WebSocketClientMessage =
  | EnterQueueMessage
  | CancelQueueMessage
  | MakeMoveMessage
  | ResignMessage
  | SignalBattleReadyMessage;

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
      self: MatchPlayerProfile;
      opponent: MatchPlayerProfile;
    }
  | {
      type: 'game_started';
      matchId: string;
      status: 'started';
      initialState: {
        turn: PlayerSide;
        board: Record<string, string>;
        hands: Record<PlayerSide, Record<string, number>>;
        skillState?: {
          board_hazards?: Record<string, unknown>[];
          board_arrow_tiles?: Record<string, unknown>[];
          movement_modifiers?: Record<string, unknown>[];
          piece_statuses?: Record<string, unknown>[];
          piece_defenses?: Record<string, unknown>[];
        };
        version: number;
        canonicalState?: MatchingCanonicalState;
      };
    }
  | {
      type: 'game_state_updated';
      matchId: string;
      version: number;
      turn: PlayerSide;
      board: Record<string, string>;
      hands: Record<PlayerSide, Record<string, number>>;
      skillState?: {
        board_hazards?: Record<string, unknown>[];
        board_arrow_tiles?: Record<string, unknown>[];
        movement_modifiers?: Record<string, unknown>[];
        piece_statuses?: Record<string, unknown>[];
        piece_defenses?: Record<string, unknown>[];
      };
      lastMove?: MovePayload;
      lastSkillTriggered?: boolean;
      canonicalState?: MatchingCanonicalState;
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
      type: 'battle_ready_ack';
      matchId: string;
      requestId: string;
      clockStarted: boolean;
    }
  | {
      type: 'battle_clock_started';
      matchId: string;
      gameVersion: number;
      turnSeconds: number;
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
