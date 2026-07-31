import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { intrinsicMoveVectorOverride } from '@/game/shop-piece-move-vectors';
import { DRAGON_KING_MOVE_VECTORS } from '@/game/ported-app-move-vectors';
import type { PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('phoenix (鳳) move vectors', () => {
  test('overrides catalog forward-only vectors to dragon-king range', () => {
    const definition: PieceDefinition = {
      pieceCode: 'piece_4c5084de2fad',
      canonicalCode: 'phoenix',
      char: '鳳',
      name: '鳳凰',
      skill: '',
      moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
    };
    expect(intrinsicMoveVectorOverride(definition)).toEqual(DRAGON_KING_MOVE_VECTORS);
  });

  test('allows orthogonal slide even when catalog moveVectors are forward 1 only', () => {
    const rules = createPhoenixRules();
    const slideForward = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:piece_4c5084de2fad',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: {
        from: '5e',
        to: '5b',
        piece: 'piece_4c5084de2fad',
        promote: false,
        drop: false,
      },
    });
    expect(slideForward.ok).toBe(true);

    const slideSide = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:piece_4c5084de2fad',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: {
        from: '5e',
        to: '1e',
        piece: 'piece_4c5084de2fad',
        promote: false,
        drop: false,
      },
    });
    expect(slideSide.ok).toBe(true);

    const diagonalOne = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:piece_4c5084de2fad',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: {
        from: '5e',
        to: '4d',
        piece: 'piece_4c5084de2fad',
        promote: false,
        drop: false,
      },
    });
    expect(diagonalOne.ok).toBe(true);

    const illegalDiagonalSlide = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:piece_4c5084de2fad',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: {
        from: '5e',
        to: '2b',
        piece: 'piece_4c5084de2fad',
        promote: false,
        drop: false,
      },
    });
    expect(illegalDiagonalSlide.ok).toBe(false);
  });
});

function createPhoenixRules(): RuleSnapshot {
  const phoenix: PieceDefinition = {
    pieceCode: 'piece_4c5084de2fad',
    canonicalCode: 'phoenix',
    char: '鳳',
    name: '鳳凰',
    skill: '',
    moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
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
    piecesByCode: {
      OU: ou,
      piece_4c5084de2fad: phoenix,
      HOO: phoenix,
    },
    skillDefinitions: [],
  };
}
