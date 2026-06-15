import { afterEach, describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { mergeSkillDefinitions } from '@/game/skill-definitions';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();
const randomSpy = { original: Math.random };

afterEach(() => {
  Math.random = randomSpy.original;
});

describe('stage 45+ pieces parity', () => {
  test('cow backward move stores charge suffix', () => {
    const rules = createRules(['COW', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:COW',
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
      move: { from: '5e', to: '5f', piece: 'COW' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5f']).toBe('black:COW@1');
  });

  test('cow charged forward move pierces enemies on the path', () => {
    const rules = createRules(['COW', 'FU', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:COW@2',
        '5c': 'white:FU',
        '5b': 'white:FU',
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
      move: { from: '5e', to: '5b', piece: 'COW' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5b']).toBe('black:COW');
    expect(result.nextGame.boardState['5c']).toBeUndefined();
    expect(result.nextGame.handsState.black.FU).toBe(2);
  });

  test('giant cannot be captured by normal move', () => {
    const rules = createRules(['GIANT', 'FU', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'white:GIANT',
        '4f': 'black:FU',
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
      move: { from: '4f', to: '5e', piece: 'FU' },
    });
    expect(result.ok).toBe(false);
  });

  test('zai capture replaces ally sen with captured enemy', () => {
    const rules = createRules(['ZAI', 'SEN', 'FU', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:ZAI',
        '4e': 'black:SEN',
        '5d': 'white:FU',
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
      move: { from: '5e', to: '5d', piece: 'ZAI' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['4e']).toBe('black:FU');
    expect(result.nextGame.boardState['5d']).toBe('black:ZAI');
  });

  test('sen move can transform into gold on proc', () => {
    Math.random = () => 0.1;
    const rules = createRules(['SEN', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:SEN',
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
      move: { from: '5e', to: '5d', piece: 'SEN' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5d']).toBe('black:KI');
  });

  test('chrysanthemum revival skips giant ally', () => {
    Math.random = () => 0;
    const rules = createRules(['CHRYSANTHEMUM', 'GIANT', 'FU', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:CHRYSANTHEMUM',
        '4e': 'black:GIANT',
        '6e': 'black:FU',
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
      move: { from: '5e', to: '5d', piece: 'CHRYSANTHEMUM' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const revival = result.nextGame.skillState?.piece_statuses?.find(
      (entry) => entry.status_type === 'chrysanthemum_revival',
    );
    expect(revival).toBeDefined();
    expect(revival?.row).toBe(4);
    expect(revival?.col).toBe(3);
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
    skillDefinitions: mergeSkillDefinitions([]),
  };
}

function createPiece(code: string): PieceDefinition {
  const charByCode: Record<string, string> = {
    COW: '牛',
    SEN: '銭',
    ZAI: '財',
    GIANT: '巨',
    CHRYSANTHEMUM: '菊',
    FU: '歩',
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
    code === 'FU'
      ? [{ dx: 0, dy: -1, maxStep: 1 }]
      : code === 'COW'
        ? [
            { dx: -1, dy: -1, maxStep: 1 },
            { dx: 0, dy: -1, maxStep: 1 },
            { dx: 1, dy: -1, maxStep: 1 },
            { dx: -1, dy: 0, maxStep: 1 },
            { dx: 1, dy: 0, maxStep: 1 },
            { dx: 0, dy: 1, maxStep: 1 },
          ]
        : kingLike;
  return {
    pieceCode: code,
    canonicalCode: code,
    sfenCode: code,
    char: charByCode[code] ?? code,
    name: code,
    skill: '',
    moveVectors: vectors,
    moveRules: [],
    moveConstraints: null,
    promotable: false,
    skillDefinitionsV2: null,
  };
}
