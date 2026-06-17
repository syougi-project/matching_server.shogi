import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('GACHA_TOU2 (逃) move parity', () => {
  test('allows forward-left diagonal even when catalog moveVectors are gold-like', () => {
    const rules = createNigeRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:GACHA_TOU2',
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
      move: { from: '5e', to: '6d', piece: 'GACHA_TOU2', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['6d']).toBe('black:GACHA_TOU2');
    expect(result.nextGame.boardState['5e']).toBeUndefined();
  });

  test('accepts legacy PIECE_GACHA_TO wire code in move payload', () => {
    const rules = createNigeRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:PIECE_GACHA_TO',
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
      move: { from: '5e', to: '6d', piece: 'PIECE_GACHA_TO', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['6d']).toBe('black:GACHA_TOU2');
  });
});

function createNigeRules(): RuleSnapshot {
  const goldLike: PieceDefinition['moveVectors'] = [
    { dx: -1, dy: -1, maxStep: 1 },
    { dx: 0, dy: -1, maxStep: 1 },
    { dx: -1, dy: 0, maxStep: 1 },
    { dx: 1, dy: 0, maxStep: 1 },
    { dx: -1, dy: 1, maxStep: 1 },
    { dx: 0, dy: 1, maxStep: 1 },
  ];

  const nige: PieceDefinition = {
    pieceCode: 'PIECE_GACHA_TO',
    canonicalCode: 'PIECE_GACHA_TO',
    char: '逃',
    name: '逃',
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
    PIECE_GACHA_TO: nige,
    GACHA_TOU2: { ...nige, pieceCode: 'GACHA_TOU2', canonicalCode: 'GACHA_TOU2' },
    逃: { ...nige, pieceCode: 'GACHA_TOU2', canonicalCode: 'GACHA_TOU2' },
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
