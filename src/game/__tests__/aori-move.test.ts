import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('GACHA_AORI orthogonal slide', () => {
  test('allows multi-square forward slide even when catalog moveVectors are 1-step', () => {
    const rules = createAoriRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:GACHA_AORI',
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
      move: { from: '5e', to: '5c', piece: 'GACHA_AORI', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5c']).toBe('black:GACHA_AORI');
    expect(result.nextGame.boardState['5e']).toBeUndefined();
  });

  test('accepts legacy client piece code in move payload', () => {
    const rules = createAoriRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:PIECE_GACHA_AORI',
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
      move: { from: '5e', to: '5c', piece: 'PIECE_GACHA_AORI', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5c']).toBe('black:GACHA_AORI');
  });
});

function createAoriRules(): RuleSnapshot {
  const oneStepGold: PieceDefinition['moveVectors'] = [
    { dx: -1, dy: -1, maxStep: 1 },
    { dx: 0, dy: -1, maxStep: 1 },
    { dx: 1, dy: -1, maxStep: 1 },
    { dx: -1, dy: 0, maxStep: 1 },
    { dx: 1, dy: 0, maxStep: 1 },
    { dx: -1, dy: 1, maxStep: 1 },
    { dx: 0, dy: 1, maxStep: 1 },
    { dx: 1, dy: 1, maxStep: 1 },
  ];

  const aori: PieceDefinition = {
    pieceCode: 'PIECE_GACHA_AORI',
    canonicalCode: 'PIECE_GACHA_AORI',
    char: '煽',
    name: '煽',
    skill: '',
    moveVectors: oneStepGold,
    canJump: false,
    isPromoted: false,
    promotable: false,
    moveConstraints: null,
    moveRules: [],
    skillDefinitionsV2: null,
  };

  const piecesByCode: Record<string, PieceDefinition> = {
    PIECE_GACHA_AORI: aori,
    GACHA_AORI: { ...aori, pieceCode: 'GACHA_AORI', canonicalCode: 'GACHA_AORI' },
    煽: { ...aori, pieceCode: 'GACHA_AORI', canonicalCode: 'GACHA_AORI' },
    OU: {
      pieceCode: 'OU',
      canonicalCode: 'KING',
      char: '王',
      name: 'King',
      skill: '',
      moveVectors: oneStepGold,
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
