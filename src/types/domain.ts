import type { MatchingCanonicalState } from '@/types/canonical-state';

export type ConnectionStatus = 'connected' | 'disconnected';

export type QueueStatus = 'waiting' | 'matching' | 'matched' | 'cancelled' | 'expired';

export type MatchStatus = 'started' | 'finished' | 'aborted';

export type PlayerSide = 'black' | 'white';

export type Turn = PlayerSide;

export type MoveVector = {
  dx: number;
  dy: number;
  maxStep: number;
  captureMode?: string | null;
};

export type MoveRule = {
  ruleType: string;
  priority: number;
  params: Record<string, unknown>;
};

export type SkillDefinition = {
  skillId: number;
  pieceCodes?: string[];
  pieceChars?: string[];
  trigger: {
    group?: string;
    type: string;
  };
  conditions: Array<{
    type: string;
    params?: Record<string, unknown>;
  }>;
  effects: Array<{
    type: string;
    target?: Record<string, unknown>;
    params?: Record<string, unknown>;
  }>;
};

export type PieceDefinition = {
  pieceCode: string;
  canonicalCode: string;
  sfenCode?: string | null;
  char: string;
  name: string;
  skill: string;
  moveVectors: MoveVector[];
  canJump?: boolean;
  isPromoted?: boolean;
  promotable?: boolean;
  moveConstraints?: Record<string, unknown> | null;
  moveRules?: MoveRule[];
  skillDefinitionsV2?: {
    definitions: SkillDefinition[];
  } | null;
};

export type RuleSnapshot = {
  version: number;
  createdAt: string;
  piecesByCode: Record<string, PieceDefinition>;
  skillDefinitions: SkillDefinition[];
};

export type BattleSetupPlacement = {
  row: number;
  col: number;
  pieceId: number;
  pieceCode: string;
};

export type BattleSetupHandPiece = {
  pieceId: number;
  pieceCode: string;
  count: number;
};

export type BattleSetupSnapshot = {
  battleSetupId: string;
  ownerUserId: string;
  status: 'draft' | 'validated' | 'locked' | 'consumed';
  name: string | null;
  boardLayout: BattleSetupPlacement[];
  handsLayout: BattleSetupHandPiece[];
  selectedPieceIds: number[];
  validationSummary: {
    boardPieceCount: number;
    handPieceCount: number;
    totalSelectedPieces: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type MovePayload = {
  from?: string;
  to: string;
  piece: string;
  promote?: boolean;
  drop?: boolean;
  notation?: string;
};

export type GameSnapshot = {
  boardState: Record<string, string>;
  handsState: Record<PlayerSide, Record<string, number>>;
  skillState?: {
    board_hazards?: Record<string, unknown>[];
    board_arrow_tiles?: Record<string, unknown>[];
    movement_modifiers?: Record<string, unknown>[];
    piece_statuses?: Record<string, unknown>[];
    piece_defenses?: Record<string, unknown>[];
  };
  turn: Turn;
  moveCount: number;
  version: number;
  lastMove?: MovePayload;
  lastSkillTriggered?: boolean;
  canonicalState?: MatchingCanonicalState;
};

export type ConnectionRecord = {
  connectionId: string;
  userId: string;
  connectedAt: string;
  lastSeenAt: string;
  status: ConnectionStatus;
  currentMatchId: string | null;
  sessionToken: string | null;
};

export type QueueEntry = {
  queueEntryId: string;
  userId: string;
  displayName: string;
  rating: number;
  ratingBucket: number;
  status: QueueStatus;
  enqueuedAt: string;
  matchingToken: string | null;
  connectionId: string;
  region: string | null;
  matchedAt: string | null;
  matchId: string | null;
  expiresAt: string | null;
  battleSetupId: string | null;
};

export type MatchSession = {
  matchId: string;
  status: MatchStatus;
  playerBlackUserId: string;
  playerWhiteUserId: string;
  playerBlackProfile: {
    userId: string;
    displayName: string;
    rating: number;
  };
  playerWhiteProfile: {
    userId: string;
    displayName: string;
    rating: number;
  };
  playerBlackConnectionId: string;
  playerWhiteConnectionId: string;
  startedAt: string;
  finishedAt: string | null;
  winnerUserId: string | null;
  endReason: string | null;
  disconnectedAtBlack: string | null;
  disconnectedAtWhite: string | null;
  reconnectDeadlineAt: string | null;
  ruleSnapshot: RuleSnapshot;
  game: GameSnapshot;
};

export type IntegrationEventType =
  | 'match.started'
  | 'match.finished'
  | 'match.aborted'
  | 'battle_setup.consume';

export type IntegrationEvent = {
  eventId: string;
  aggregateType: 'match' | 'battle_setup';
  aggregateId: string;
  eventType: IntegrationEventType;
  payload: Record<string, unknown>;
  deliveryStatus: 'pending' | 'delivered' | 'failed';
  attemptCount: number;
  nextAttemptAt: string | null;
  createdAt: string;
  idempotencyKey: string;
};
