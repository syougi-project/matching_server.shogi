import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { RuleSnapshotBuilder } from '@/catalog/rule-snapshot';
import type { GameSnapshot, PieceDefinition } from '@/types/domain';

const bffLikePawn: PieceDefinition = {
  pieceCode: 'PIECE_C518B11858F2',
  canonicalCode: 'PAWN',
  sfenCode: 'P',
  char: '歩',
  name: 'Pawn',
  skill: '',
  moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
  canJump: false,
  isPromoted: false,
  promotable: true,
  moveConstraints: null,
  moveRules: [],
  skillDefinitionsV2: null,
};

async function buildRules() {
  return new RuleSnapshotBuilder({
    async listPieces() {
      return [bffLikePawn];
    },
  }).buildSnapshot();
}

describe('poison landing with BFF-like pawn code', () => {
  test('accepts opaque piece id payload onto poison cell', async () => {
    const rules = await buildRules();
    expect(rules.piecesByCode.FU?.pieceCode).toBe('FU');
    const engine = new BasicRuleEngine();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5d': 'white:PIECE_C518B11858F2',
      },
      handsState: { black: {}, white: {} },
      skillState: {
        board_hazards: [
          {
            row: 4,
            col: 4,
            hazard_type: 'poison_cell',
            affects_side: 'white',
            remaining_turns: 4,
          },
        ],
        board_arrow_tiles: [],
        movement_modifiers: [],
        piece_statuses: [],
        piece_defenses: [],
      },
      turn: 'white',
      moveCount: 2,
      version: 3,
    };

    const result = engine.applyMove({
      game,
      rules,
      actorSide: 'white',
      move: {
        from: '5d',
        to: '5e',
        piece: 'PIECE_C518B11858F2',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5e']).toBeUndefined();
  });
});
