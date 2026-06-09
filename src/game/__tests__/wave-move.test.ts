import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('NAM wave orthogonal 2-step move', () => {
  test('allows 2-square slide even when catalog moveVectors are rook-like', () => {
    const rules = createWaveRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:PIECE_FA4D64B2BE20',
      },
      handsState: { black: {}, white: {} },
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '5c', piece: 'NAM', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5c']).toBe('black:NAM');
    expect(result.nextGame.boardState['5e']).toBeUndefined();
  });

  test('rejects 3-square slide beyond wave range', () => {
    const rules = createWaveRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:PIECE_FA4D64B2BE20',
      },
      handsState: { black: {}, white: {} },
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '5b', piece: 'NAM', promote: false, drop: false },
    });

    expect(result.ok).toBe(false);
  });
});

function createWaveRules(): RuleSnapshot {
  const rookLike: PieceDefinition['moveVectors'] = [
    { dx: 0, dy: -1, maxStep: 8 },
    { dx: 0, dy: 1, maxStep: 8 },
    { dx: -1, dy: 0, maxStep: 8 },
    { dx: 1, dy: 0, maxStep: 8 },
  ];

  const wave: PieceDefinition = {
    pieceCode: 'PIECE_FA4D64B2BE20',
    canonicalCode: 'NAM',
    char: '波',
    name: '波',
    skill: '',
    moveVectors: rookLike,
    canJump: false,
    isPromoted: false,
    promotable: false,
    moveConstraints: null,
    moveRules: [],
    skillDefinitionsV2: null,
    sfenCode: 'WAVE',
  };

  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode: {
      OU: {
        pieceCode: 'OU',
        canonicalCode: 'OU',
        char: '王',
        name: 'King',
        skill: '',
        moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
        canJump: false,
        isPromoted: false,
        promotable: false,
        moveConstraints: null,
        moveRules: [],
        skillDefinitionsV2: null,
        sfenCode: 'K',
      },
      PIECE_FA4D64B2BE20: wave,
      NAM: wave,
    },
    skillDefinitions: [],
  };
}
