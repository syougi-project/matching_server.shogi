import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('HOU leap-over-one movement', () => {
  test('allows empty-square moves along orthogonal rays', () => {
    const rules = createHouRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:HOU',
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
      move: { from: '5e', to: '5c', piece: 'HOU', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5c']).toBe('black:HOU');
    expect(result.nextGame.boardState['5e']).toBeUndefined();
  });

  test('allows capture by jumping over exactly one platform piece', () => {
    const rules = createHouRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:HOU',
        '5d': 'white:FU',
        '5c': 'white:FU',
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
      move: { from: '5e', to: '5c', piece: 'HOU', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5c']).toBe('black:HOU');
    expect(result.nextGame.boardState['5d']).toBe('white:FU');
    expect(result.nextGame.handsState.black.FU).toBe(1);
  });

  test('rejects capture without a platform piece', () => {
    const rules = createHouRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:HOU',
        '5c': 'white:FU',
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
      move: { from: '5e', to: '5c', piece: 'HOU', promote: false, drop: false },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('ILLEGAL_MOVE');
  });
});

function createHouRules(): RuleSnapshot {
  const hou: PieceDefinition = {
    pieceCode: 'HOU',
    canonicalCode: 'HOU',
    char: '砲',
    name: '砲',
    skill: '',
    moveVectors: [
      { dx: 0, dy: -1, maxStep: 9, captureMode: 'LeapOverOne' },
      { dx: 0, dy: 1, maxStep: 9, captureMode: 'LeapOverOne' },
      { dx: -1, dy: 0, maxStep: 9, captureMode: 'LeapOverOne' },
      { dx: 1, dy: 0, maxStep: 9, captureMode: 'LeapOverOne' },
    ],
    canJump: false,
    isPromoted: false,
    promotable: false,
    moveConstraints: null,
    moveRules: [],
    skillDefinitionsV2: null,
  };

  const piecesByCode: Record<string, PieceDefinition> = {
    HOU: hou,
    FU: {
      pieceCode: 'FU',
      canonicalCode: 'PAWN',
      char: '歩',
      name: 'Pawn',
      skill: '',
      moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
      canJump: false,
      isPromoted: false,
      promotable: true,
      moveConstraints: null,
      moveRules: [],
      skillDefinitionsV2: null,
    },
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
