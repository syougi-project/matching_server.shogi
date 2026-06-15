import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('mirror and reflection piece movement', () => {
  test('allows orthogonal 1-step when no enemy is directly in front', () => {
    const rules = createMirrorRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '1a': 'white:OU',
        '5e': 'black:MIRROR',
        '2g': 'white:FU',
      },
      handsState: { black: {}, white: {} },
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    for (const to of ['4e', '5d', '5f', '6e'] as const) {
      const result = engine.applyMove({
        actorSide: 'black',
        rules,
        game,
        move: { from: '5e', to, piece: 'MIRROR', promote: false, drop: false },
      });
      expect(result.ok).toBe(true);
    }

    const illegalDiagonal = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '4d', piece: 'MIRROR', promote: false, drop: false },
    });
    expect(illegalDiagonal.ok).toBe(false);
  });

  test('copies front-facing enemy movement instead of a random side enemy', () => {
    const rules = createMirrorRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:MIRROR',
        '2c': 'white:KE',
        '1e': 'white:OU',
      },
      handsState: { black: {}, white: {} },
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    for (const to of ['4d', '4e', '4f'] as const) {
      const result = engine.applyMove({
        actorSide: 'black',
        rules,
        game,
        move: { from: '5e', to, piece: 'MIRROR', promote: false, drop: false },
      });
      expect(result.ok).toBe(true);
    }

    const knightJump = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '3c', piece: 'MIRROR', promote: false, drop: false },
    });
    expect(knightJump.ok).toBe(false);
  });
});

function createMirrorRules(): RuleSnapshot {
  const kingVectors: PieceDefinition['moveVectors'] = [
    { dx: -1, dy: -1, maxStep: 1 },
    { dx: 0, dy: -1, maxStep: 1 },
    { dx: 1, dy: -1, maxStep: 1 },
    { dx: -1, dy: 0, maxStep: 1 },
    { dx: 1, dy: 0, maxStep: 1 },
    { dx: -1, dy: 1, maxStep: 1 },
    { dx: 0, dy: 1, maxStep: 1 },
    { dx: 1, dy: 1, maxStep: 1 },
  ];
  const knightVectors: PieceDefinition['moveVectors'] = [
    { dx: -1, dy: -2, maxStep: 1 },
    { dx: 1, dy: -2, maxStep: 1 },
  ];
  const mirror: PieceDefinition = {
    pieceCode: 'MIRROR',
    canonicalCode: 'MIRROR',
    char: '鏡',
    name: '鏡',
    skill: '',
    moveVectors: [],
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
      OU: { ...mirror, pieceCode: 'OU', canonicalCode: 'OU', char: '王', moveVectors: kingVectors },
      KE: { ...mirror, pieceCode: 'KE', canonicalCode: 'KE', char: '桂', moveVectors: knightVectors, canJump: true },
      MIRROR: mirror,
    },
    skillDefinitions: [],
  };
}
