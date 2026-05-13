import type { GameSnapshot, MovePayload, PlayerSide, RuleSnapshot } from '@/types/domain';

export type ApplyMoveInput = {
  game: GameSnapshot;
  rules: RuleSnapshot;
  actorSide: PlayerSide;
  move: MovePayload;
};

export type ApplyMoveResult =
  | {
      ok: true;
      nextGame: GameSnapshot;
      finished?: {
        winnerSide: PlayerSide;
        reason: 'checkmate' | 'king_capture';
      };
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export interface RuleEngine {
  createInitialGame(rules: RuleSnapshot): GameSnapshot;
  applyMove(input: ApplyMoveInput): ApplyMoveResult;
}
