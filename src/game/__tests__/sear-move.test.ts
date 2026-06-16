import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import type { PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('SEAR forward-two and side-back-one moves', () => {
  test('allows forward two-step move even when catalog vectors are forward-only', () => {
    const rules = createSearRules();
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:SEAR',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '5c', piece: 'SEAR', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5c']).toBe('black:SEAR');
    expect(result.nextGame.boardState['5e']).toBeUndefined();
  });

  test('allows lateral one-step move even when catalog vectors are forward-only', () => {
    const rules = createSearRules();
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:SEAR',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '4e', piece: 'SEAR', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
  });
});

function createSearRules(): RuleSnapshot {
  const sear: PieceDefinition = {
    pieceCode: 'SEAR',
    canonicalCode: 'SEAR',
    char: '焼',
    name: '焼',
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
      SEAR: sear,
    },
    skillDefinitions: [],
  };
}
