import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import type { PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('SHOP_SO run forward two-step', () => {
  test('allows forward two-step when the first square is empty', () => {
    const rules = createRunRules();
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:PIECE_SHOP_SO',
        },
        handsState: { black: {}, white: {} },
        skillState: emptySkillState(),
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '5c', piece: 'SHOP_SO', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5c']).toBe('black:PIECE_SHOP_SO');
  });

  test('rejects forward two-step when the first square is blocked', () => {
    const rules = createRunRules();
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:PIECE_SHOP_SO',
          '5d': 'black:FU',
        },
        handsState: { black: {}, white: {} },
        skillState: emptySkillState(),
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '5c', piece: 'SHOP_SO', promote: false, drop: false },
    });

    expect(result.ok).toBe(false);
  });
});

function emptySkillState() {
  return {
    board_hazards: [],
    board_arrow_tiles: [],
    movement_modifiers: [],
    piece_statuses: [],
    piece_defenses: [],
  };
}

function createRunRules(): RuleSnapshot {
  const kingLike: PieceDefinition['moveVectors'] = [
    { dx: -1, dy: -1, maxStep: 1 },
    { dx: 0, dy: -1, maxStep: 1 },
    { dx: 1, dy: -1, maxStep: 1 },
    { dx: -1, dy: 0, maxStep: 1 },
    { dx: 1, dy: 0, maxStep: 1 },
    { dx: -1, dy: 1, maxStep: 1 },
    { dx: 0, dy: 1, maxStep: 1 },
    { dx: 1, dy: 1, maxStep: 1 },
  ];
  const run: PieceDefinition = {
    pieceCode: 'PIECE_SHOP_SO',
    canonicalCode: 'SHOP_SO',
    char: '走',
    name: '走',
    skill: '',
    moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
    canJump: false,
    isPromoted: false,
    promotable: false,
    moveConstraints: null,
    moveRules: [],
    skillDefinitionsV2: null,
  };
  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode: {
      OU: {
        pieceCode: 'OU',
        canonicalCode: 'OU',
        char: '王',
        name: '王',
        skill: '',
        moveVectors: kingLike,
        canJump: false,
        isPromoted: false,
        promotable: false,
        moveConstraints: null,
        moveRules: [],
        skillDefinitionsV2: null,
      },
      FU: {
        pieceCode: 'FU',
        canonicalCode: 'FU',
        char: '歩',
        name: '歩',
        skill: '',
        moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
        canJump: false,
        isPromoted: false,
        promotable: true,
        moveConstraints: null,
        moveRules: [],
        skillDefinitionsV2: null,
      },
      PIECE_SHOP_SO: run,
      SHOP_SO: run,
    },
    skillDefinitions: [],
  };
}
