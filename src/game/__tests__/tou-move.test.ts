import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('GACHA_TOU (灯) move parity', () => {
  test('allows back-right diagonal even when catalog moveVectors are gold-like', () => {
    const rules = createTouRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:GACHA_TOU',
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
      move: { from: '5e', to: '4f', piece: 'GACHA_TOU', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['4f']).toBe('black:GACHA_TOU');
    expect(result.nextGame.boardState['5e']).toBeUndefined();
  });

  test('accepts legacy client piece code in move payload', () => {
    const rules = createTouRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:PIECE_GACHA_TOU',
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
      move: { from: '5e', to: '4f', piece: 'PIECE_GACHA_TOU', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['4f']).toBe('black:GACHA_TOU');
  });
});

function createTouRules(): RuleSnapshot {
  const goldLike: PieceDefinition['moveVectors'] = [
    { dx: -1, dy: -1, maxStep: 1 },
    { dx: 0, dy: -1, maxStep: 1 },
    { dx: 1, dy: -1, maxStep: 1 },
    { dx: -1, dy: 0, maxStep: 1 },
    { dx: 1, dy: 0, maxStep: 1 },
    { dx: -1, dy: 1, maxStep: 1 },
  ];

  const tou: PieceDefinition = {
    pieceCode: 'PIECE_GACHA_TOU',
    canonicalCode: 'PIECE_GACHA_TOU',
    char: '灯',
    name: '灯',
    skill: '',
    moveVectors: goldLike,
    canJump: false,
    isPromoted: false,
    promotable: false,
    moveConstraints: null,
    moveRules: [],
    skillDefinitionsV2: null,
  };

  const piecesByCode: Record<string, PieceDefinition> = {
    PIECE_GACHA_TOU: tou,
    GACHA_TOU: { ...tou, pieceCode: 'GACHA_TOU', canonicalCode: 'GACHA_TOU' },
    灯: { ...tou, pieceCode: 'GACHA_TOU', canonicalCode: 'GACHA_TOU' },
    OU: {
      pieceCode: 'OU',
      canonicalCode: 'KING',
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
      canJump: false,
      isPromoted: false,
      promotable: false,
      moveConstraints: null,
      moveRules: [],
      skillDefinitionsV2: null,
    },
  };

  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode,
    skillDefinitions: [],
  };
}
