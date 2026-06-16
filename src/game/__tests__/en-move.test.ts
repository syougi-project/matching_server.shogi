import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import type { PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('GACHA_EN ally king front move', () => {
  test('allows moving to ally king front even when not an adjacent orthogonal step', () => {
    const rules = createEnRules();
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5a': 'white:OU',
          '6f': 'black:GACHA_EN',
          '5h': 'black:OU',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '6f', to: '5g', piece: 'GACHA_EN', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5g']).toBe('black:GACHA_EN');
    expect(result.nextGame.boardState['6f']).toBeUndefined();
  });

  test('allows orthogonal one-step move', () => {
    const rules = createEnRules();
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:GACHA_EN',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '5f', piece: 'GACHA_EN', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
  });

  test('rejects king front when occupied by ally', () => {
    const rules = createEnRules();
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '6f': 'black:GACHA_EN',
          '5g': 'black:FU',
          '5h': 'black:OU',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '6f', to: '5g', piece: 'GACHA_EN', promote: false, drop: false },
    });

    expect(result.ok).toBe(false);
  });
});

function createEnRules(): RuleSnapshot {
  const en: PieceDefinition = {
    pieceCode: 'GACHA_EN',
    canonicalCode: 'GACHA_EN',
    char: '閹',
    name: '閹',
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
        moveVectors: [{ dx: -1, dy: -1, maxStep: 1 }],
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
        promotable: false,
        moveConstraints: null,
        moveRules: [],
        skillDefinitionsV2: null,
      },
      GACHA_EN: en,
    },
    skillDefinitions: [],
  };
}
