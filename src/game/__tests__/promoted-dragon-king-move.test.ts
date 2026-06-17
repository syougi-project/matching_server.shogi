import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import type { PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('promoted rook (dragon king) movement', () => {
  test('allows orthogonal slide and one-step diagonal for promoted HI', () => {
    const rules = createStandardRules();
    const slideResult = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:HI+',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '5a', piece: 'HI', promote: false, drop: false },
    });
    expect(slideResult.ok).toBe(true);

    const diagonalResult = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:HI+',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '4d', piece: 'HI', promote: false, drop: false },
    });
    expect(diagonalResult.ok).toBe(true);

    const illegalDiagonalSlide = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:HI+',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '1a', piece: 'HI', promote: false, drop: false },
    });
    expect(illegalDiagonalSlide.ok).toBe(false);
  });
});

describe('promoted bishop (dragon horse) movement', () => {
  test('allows diagonal slide and one-step orthogonal for promoted KA', () => {
    const rules = createStandardRulesWithBishop();
    const slideResult = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:KA+',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '1a', piece: 'KA', promote: false, drop: false },
    });
    expect(slideResult.ok).toBe(true);

    const orthogonalResult = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:KA+',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '5d', piece: 'KA', promote: false, drop: false },
    });
    expect(orthogonalResult.ok).toBe(true);

    const illegalOrthogonalSlide = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:KA+',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '5a', piece: 'KA', promote: false, drop: false },
    });
    expect(illegalOrthogonalSlide.ok).toBe(false);
  });
});

describe('promoted gold-like pieces movement', () => {
  test('allows promoted KE narigin to move like gold', () => {
    const rules = createGoldLikeRules();
    const forwardResult = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:KE+',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '5d', piece: 'KE', promote: false, drop: false },
    });
    expect(forwardResult.ok).toBe(true);

    const sideResult = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:KE+',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '4e', piece: 'KE', promote: false, drop: false },
    });
    expect(sideResult.ok).toBe(true);

    const illegalKnightJump = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:KE+',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '4c', piece: 'KE', promote: false, drop: false },
    });
    expect(illegalKnightJump.ok).toBe(false);
  });

  test('allows promoted KY narikyo to move like gold', () => {
    const rules = createLanceRules();
    const forwardResult = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:KY+',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '5d', piece: 'KY', promote: false, drop: false },
    });
    expect(forwardResult.ok).toBe(true);

    const sideResult = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:KY+',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '4e', piece: 'KY', promote: false, drop: false },
    });
    expect(sideResult.ok).toBe(true);

    const illegalLanceSlide = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:KY+',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '5a', piece: 'KY', promote: false, drop: false },
    });
    expect(illegalLanceSlide.ok).toBe(false);
  });
});

function createLanceRules(): RuleSnapshot {
  const ky: PieceDefinition = {
    pieceCode: 'KY',
    canonicalCode: 'KY',
    char: '香',
    name: 'Lance',
    skill: '',
    moveVectors: [{ dx: 0, dy: -1, maxStep: 8 }],
    promotable: true,
  };
  const ou: PieceDefinition = {
    pieceCode: 'OU',
    canonicalCode: 'OU',
    char: '王',
    name: 'King',
    skill: '',
    moveVectors: [
      { dx: -1, dy: -1, maxStep: 1 },
      { dx: 0, dy: -1, maxStep: 1 },
      { dx: 1, dy: -1, maxStep: 1 },
      { dx: -1, dy: 0, maxStep: 1 },
      { dx: 1, dy: 0, maxStep: 1 },
      { dx: -1, dy: 1, maxStep: 1 },
      { dx: 0, dy: 1, maxStep: 1 },
      { dx: 1, dy: 1, maxStep: 1 },
    ],
  };
  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode: { KY: ky, OU: ou },
    skillDefinitions: [],
  };
}

function createGoldLikeRules(): RuleSnapshot {
  const ke: PieceDefinition = {
    pieceCode: 'KE',
    canonicalCode: 'KE',
    char: '桂',
    name: 'Knight',
    skill: '',
    moveVectors: [
      { dx: -1, dy: -2, maxStep: 1 },
      { dx: 1, dy: -2, maxStep: 1 },
    ],
    promotable: true,
    canJump: true,
  };
  const ou: PieceDefinition = {
    pieceCode: 'OU',
    canonicalCode: 'OU',
    char: '王',
    name: 'King',
    skill: '',
    moveVectors: [
      { dx: -1, dy: -1, maxStep: 1 },
      { dx: 0, dy: -1, maxStep: 1 },
      { dx: 1, dy: -1, maxStep: 1 },
      { dx: -1, dy: 0, maxStep: 1 },
      { dx: 1, dy: 0, maxStep: 1 },
      { dx: -1, dy: 1, maxStep: 1 },
      { dx: 0, dy: 1, maxStep: 1 },
      { dx: 1, dy: 1, maxStep: 1 },
    ],
  };
  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode: { KE: ke, OU: ou },
    skillDefinitions: [],
  };
}

function createStandardRulesWithBishop(): RuleSnapshot {
  const ka: PieceDefinition = {
    pieceCode: 'KA',
    canonicalCode: 'KA',
    char: '角',
    name: 'Bishop',
    skill: '',
    moveVectors: [
      { dx: -1, dy: -1, maxStep: 8 },
      { dx: 1, dy: -1, maxStep: 8 },
      { dx: -1, dy: 1, maxStep: 8 },
      { dx: 1, dy: 1, maxStep: 8 },
    ],
    promotable: true,
  };
  const ou: PieceDefinition = {
    pieceCode: 'OU',
    canonicalCode: 'OU',
    char: '王',
    name: 'King',
    skill: '',
    moveVectors: [
      { dx: -1, dy: -1, maxStep: 1 },
      { dx: 0, dy: -1, maxStep: 1 },
      { dx: 1, dy: -1, maxStep: 1 },
      { dx: -1, dy: 0, maxStep: 1 },
      { dx: 1, dy: 0, maxStep: 1 },
      { dx: -1, dy: 1, maxStep: 1 },
      { dx: 0, dy: 1, maxStep: 1 },
      { dx: 1, dy: 1, maxStep: 1 },
    ],
  };
  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode: { KA: ka, OU: ou },
    skillDefinitions: [],
  };
}

function createStandardRules(): RuleSnapshot {
  const hi: PieceDefinition = {
    pieceCode: 'HI',
    canonicalCode: 'HI',
    char: '飛',
    name: 'Rook',
    skill: '',
    moveVectors: [
      { dx: 0, dy: -1, maxStep: 8 },
      { dx: 0, dy: 1, maxStep: 8 },
      { dx: -1, dy: 0, maxStep: 8 },
      { dx: 1, dy: 0, maxStep: 8 },
    ],
    promotable: true,
  };
  const ou: PieceDefinition = {
    pieceCode: 'OU',
    canonicalCode: 'OU',
    char: '王',
    name: 'King',
    skill: '',
    moveVectors: [
      { dx: -1, dy: -1, maxStep: 1 },
      { dx: 0, dy: -1, maxStep: 1 },
      { dx: 1, dy: -1, maxStep: 1 },
      { dx: -1, dy: 0, maxStep: 1 },
      { dx: 1, dy: 0, maxStep: 1 },
      { dx: -1, dy: 1, maxStep: 1 },
      { dx: 0, dy: 1, maxStep: 1 },
      { dx: 1, dy: 1, maxStep: 1 },
    ],
  };
  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode: { HI: hi, OU: ou },
    skillDefinitions: [],
  };
}
