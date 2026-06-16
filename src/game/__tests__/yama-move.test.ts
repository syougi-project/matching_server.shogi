import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import type { PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('YAMA diagonal one-step moves', () => {
  test('allows diagonal one-step moves even when catalog vectors are forward-only', () => {
    const rules = createYamaRules();
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:YAMA',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '4d', piece: 'YAMA', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['4d']).toBe('black:YAMA');
    expect(result.nextGame.boardState['5e']).toBeUndefined();
  });

  test('rejects orthogonal one-step move when catalog vectors are forward-only', () => {
    const rules = createYamaRules();
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:YAMA',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '5f', piece: 'YAMA', promote: false, drop: false },
    });

    expect(result.ok).toBe(false);
  });
});

function createYamaRules(): RuleSnapshot {
  const yama: PieceDefinition = {
    pieceCode: 'YAMA',
    canonicalCode: 'YAMA',
    char: '山',
    name: '山',
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
      YAMA: yama,
    },
    skillDefinitions: [],
  };
}
