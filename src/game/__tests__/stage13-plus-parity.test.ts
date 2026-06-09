import { afterEach, describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { mergeSkillDefinitions } from '@/game/skill-definitions';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();
const originalRandom = Math.random;

afterEach(() => {
  Math.random = originalRandom;
});

describe('stage13+ online skill parity', () => {
  test('cloud can capture ally but not enemy', () => {
    const rules = createRules(['CLOUD', 'FU', 'KI', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:CLOUD',
        '5f': 'black:FU',
        '4e': 'white:FU',
      },
      handsState: { black: {}, white: {} },
      skillState: emptySkillState(),
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    const allyCapture = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '5f', piece: 'CLOUD' },
    });
    expect(allyCapture.ok).toBe(true);
    if (!allyCapture.ok) return;
    expect(allyCapture.nextGame.boardState['5f']).toBe('black:CLOUD');
    expect(allyCapture.nextGame.handsState.black.FU).toBe(1);

    const enemyCapture = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '4e', piece: 'CLOUD' },
    });
    expect(enemyCapture.ok).toBe(false);
  });

  test('phantom evades capture with seeded random', () => {
    Math.random = () => 0.1;
    const rules = createRules(['PHANTOM', 'GI', 'OU']);
    rules.skillDefinitions = mergeSkillDefinitions(rules.skillDefinitions);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '4e': 'white:PHANTOM',
        '5f': 'black:GI',
      },
      handsState: { black: {}, white: {} },
      skillState: emptySkillState(),
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5f', to: '4e', piece: 'GI' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.handsState.black.PHANTOM).toBeUndefined();
    expect(result.nextGame.boardState['4e']).toBe('black:GI');
    const phantomSquare = Object.entries(result.nextGame.boardState).find(([, value]) =>
      value.endsWith(':PHANTOM'),
    );
    expect(phantomSquare?.[0]).not.toBe('4e');
  });

  test('house skill summons people in home camp', () => {
    Math.random = () => 0;
    const rules = createRules(['HOUSE', 'PEOPLE', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:HOUSE',
      },
      handsState: { black: {}, white: {} },
      skillState: emptySkillState(),
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '5e', piece: 'HOUSE', notation: 'house_skill_only' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const people = Object.values(result.nextGame.boardState).filter((value) => value.endsWith(':PEOPLE'));
    expect(people).toHaveLength(1);
  });

  test('mist sends adjacent enemy to hand when proc succeeds', () => {
    Math.random = () => 0;
    const rules = createRules(['MIST', 'FU', 'OU']);
    rules.skillDefinitions = mergeSkillDefinitions(rules.skillDefinitions);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:MIST',
        '4f': 'white:FU',
      },
      handsState: { black: {}, white: {} },
      skillState: emptySkillState(),
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '5f', piece: 'MIST' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['4f']).toBeUndefined();
    expect(result.nextGame.handsState.white.FU).toBe(1);
  });
});

function emptySkillState(): GameSnapshot['skillState'] {
  return {
    board_hazards: [],
    board_arrow_tiles: [],
    movement_modifiers: [],
    piece_statuses: [],
    piece_defenses: [],
  };
}

function createRules(codes: string[]): RuleSnapshot {
  const piecesByCode: Record<string, PieceDefinition> = {};
  for (const code of ['FU', 'GI', 'KI', 'OU', ...codes]) {
    piecesByCode[code] = createPiece(code);
  }
  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode,
    skillDefinitions: [],
  };
}

function createPiece(code: string): PieceDefinition {
  const charByCode: Record<string, string> = {
    CLOUD: '雲',
    PHANTOM: '幻',
    HOUSE: '家',
    PEOPLE: '民',
    MIST: '霧',
    FU: '歩',
    GI: '銀',
    OU: '王',
  };
  const kingLike = [
    { dx: -1, dy: -1, maxStep: 1 },
    { dx: 0, dy: -1, maxStep: 1 },
    { dx: 1, dy: -1, maxStep: 1 },
    { dx: -1, dy: 0, maxStep: 1 },
    { dx: 1, dy: 0, maxStep: 1 },
    { dx: -1, dy: 1, maxStep: 1 },
    { dx: 0, dy: 1, maxStep: 1 },
    { dx: 1, dy: 1, maxStep: 1 },
  ];
  const vectors =
    code === 'CLOUD'
      ? [
          { dx: 0, dy: -1, maxStep: 8 },
          { dx: 0, dy: 1, maxStep: 8 },
          { dx: -1, dy: 0, maxStep: 8 },
          { dx: 1, dy: 0, maxStep: 8 },
          { dx: -1, dy: -1, maxStep: 8 },
          { dx: 1, dy: -1, maxStep: 8 },
          { dx: -1, dy: 1, maxStep: 8 },
          { dx: 1, dy: 1, maxStep: 8 },
        ]
      : code === 'MIST' || code === 'GI'
        ? kingLike
        : [{ dx: 0, dy: -1, maxStep: 1 }];
  return {
    pieceCode: code,
    canonicalCode: code,
    sfenCode: code,
    char: charByCode[code] ?? code,
    name: code,
    moveVectors: vectors,
    moveRules: [],
    moveConstraints: null,
    promotable: false,
    skillDefinitionsV2: null,
  };
}
