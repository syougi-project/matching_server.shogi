import { afterEach, describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { PORTED_APP_SKILL_CODES } from '@/game/ported-app-skill-codes';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';
import fixture from '../../../test-fixtures/online-skill-parity/ported-skill-cases.json';

const engine = new BasicRuleEngine();
const originalRandom = Math.random;

afterEach(() => {
  Math.random = originalRandom;
});

describe('ported app.shogi skill behavior', () => {
  const cases = fixture.cases.map((entry) => ({
    pieceCode: entry.pieceCode,
    actorPieceCode: entry.actorPieceCode ?? entry.pieceCode,
    serverMove: {
      ...fixture.defaults.serverMove,
      piece: entry.actorPieceCode ?? entry.pieceCode,
      ...(entry.serverMove ?? {}),
    },
  }));

  test.each(cases.filter((entry) => entry.pieceCode !== 'GACHA_KOU'))(
    'runs %s through the matching server rule engine',
    ({ pieceCode, actorPieceCode, serverMove }) => {
      Math.random = () => 0;
      const result = engine.applyMove({
        actorSide: 'black',
        rules: createRules(),
        game: createSkillGame(pieceCode),
        move: serverMove,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.nextGame.version).toBe(2);
      expect(result.nextGame.turn).toBe('white');
      expect(Object.values(result.nextGame.boardState)).toContain(`black:${actorPieceCode}`);
    },
  );

  test('runs GACHA_KOU when an adjacent ally moves horizontally', () => {
    Math.random = () => 0;
    const result = engine.applyMove({
      actorSide: 'black',
      rules: createRules(),
      game: {
        ...createSkillGame('SUI'),
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:SUI',
          '5d': 'black:GACHA_KOU',
        },
      },
      move: { from: '5e', to: '4e', piece: 'SUI' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['4d']).toBe('black:GACHA_KOU');
  });

  test('accepts canonical app piece code in move payload for BFF board code', () => {
    Math.random = () => 0;
    const result = engine.applyMove({
      actorSide: 'black',
      rules: createRules(),
      game: {
        ...createSkillGame('PIECE_GACHA_KO'),
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:PIECE_GACHA_KO',
        },
      },
      move: { from: '5e', to: '5f', piece: 'GACHA_KOU' },
    });

    expect(result.ok).toBe(true);
  });

  test('maps BFF gacha baku code to adjacent push skill', () => {
    Math.random = () => 0;
    const result = engine.applyMove({
      actorSide: 'black',
      rules: createRules(),
      game: {
        ...createSkillGame('PIECE_GACHA_BAKU'),
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:PIECE_GACHA_BAKU',
          '6e': 'black:FU',
        },
      },
      move: { from: '5e', to: '5f', piece: 'PIECE_GACHA_BAKU' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['6e']).toBeUndefined();
    expect(result.nextGame.boardState['7d']).toBe('black:FU');
  });

  test('maps instance id flame piece by char to enn skill', () => {
    Math.random = () => 0;
    const rules = createRules();
    rules.piecesByCode.PIECE_FLAME_INSTANCE = {
      ...createPiece('ENN'),
      pieceCode: 'PIECE_FLAME_INSTANCE',
      canonicalCode: 'ENN',
      char: '炎',
    };
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:PIECE_FLAME_INSTANCE',
          '4f': 'white:FU',
        },
        handsState: { black: {}, white: {} },
        skillState: {
          board_hazards: [],
          board_arrow_tiles: [],
          movement_modifiers: [],
          piece_statuses: [],
          piece_defenses: [],
        },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '5f', piece: 'PIECE_FLAME_INSTANCE' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['4f']).toBeUndefined();
  });

  test.each([
    ['PIECE_GACHA_BAKU', '爆'],
    ['PIECE_GACHA_MURO', '室'],
    ['PIECE_GACHA_SADAME', '定'],
    ['PIECE_GACHA_AN', '安'],
    ['PIECE_GACHA_SO', '宋'],
    ['PIECE_GACHA_TOU', '灯'],
    ['PIECE_GACHA_HEN', '辺'],
    ['PIECE_GACHA_ITSU', '逸'],
    ['PIECE_GACHA_TO', '逃'],
    ['PIECE_GACHA_SOU', '艸'],
    ['PIECE_GACHA_KO', '膠'],
  ] as const)('accepts BFF board code %s for scripted skill move', (boardCode, char) => {
    Math.random = () => 0;
    const rules = createRules();
    rules.piecesByCode[boardCode] = {
      ...createPiece(boardCode),
      char,
    };
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        ...createSkillGame(boardCode),
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': `black:${boardCode}`,
        },
      },
      move: { from: '5e', to: '5f', piece: boardCode },
    });

    expect(result.ok).toBe(true);
  });

  test('maps BFF gacha muro code to shitsu safe-room skill', () => {
    Math.random = () => 0;
    const result = engine.applyMove({
      actorSide: 'black',
      rules: createRules(),
      game: {
        ...createSkillGame('GACHA_MURO'),
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:GACHA_MURO',
        },
      },
      move: { from: '5e', to: '5f', piece: 'GACHA_MURO' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.nextGame.skillState?.board_hazards ?? []).length).toBeGreaterThan(0);
  });

  test('tane move summons leaf on adjacent empty cell when proc succeeds', () => {
    Math.random = () => 0;
    const result = engine.applyMove({
      actorSide: 'black',
      rules: createRules(),
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:TANE',
        },
        handsState: { black: {}, white: {} },
        skillState: {
          board_hazards: [],
          board_arrow_tiles: [],
          movement_modifiers: [],
          piece_statuses: [],
          piece_defenses: [],
        },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '5d', piece: 'TANE' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const leafSquares = Object.entries(result.nextGame.boardState).filter(([, piece]) =>
      piece.includes(':HAA'),
    );
    expect(leafSquares.length).toBe(1);
    expect(result.nextGame.lastSkillTriggered).toBe(true);
  });

  test('stateful skills affect later legal move validation', () => {
    Math.random = () => 0;
    const rainbow = engine.applyMove({
      actorSide: 'black',
      rules: createRules(),
      game: {
        ...createSkillGame('RAINBOW'),
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:RAINBOW',
          '4f': 'white:KA',
        },
      },
      move: { from: '5e', to: '5f', piece: 'RAINBOW' },
    });

    expect(rainbow.ok).toBe(true);
    if (!rainbow.ok) return;
    const illegalDiagonal = engine.applyMove({
      actorSide: 'white',
      rules: createRules(),
      game: rainbow.nextGame,
      move: { from: '4f', to: '3g', piece: 'KA' },
    });
    expect(illegalDiagonal.ok).toBe(false);
  });
});

function createSkillGame(pieceCode: string): GameSnapshot {
  return {
    boardState: {
      '5i': 'black:OU',
      '5a': 'white:OU',
      '5e': `black:${pieceCode}`,
      '5d': 'black:FU',
      '6e': 'black:FU',
      '4g': 'white:FU',
      '6g': 'white:GI',
      '7g': 'white:KI',
    },
    handsState: {
      black: { FU: 1 },
      white: { FU: 2, GI: 1 },
    },
    skillState: {
      board_hazards: [],
      board_arrow_tiles: [],
      movement_modifiers: [],
      piece_statuses: [],
      piece_defenses: [],
    },
    turn: 'black',
    moveCount: 0,
    version: 1,
  };
}

function createRules(): RuleSnapshot {
  const piecesByCode: Record<string, PieceDefinition> = {};
  for (const code of [
    'FU',
    'GI',
    'KI',
    'KA',
    'OU',
    'COPPER',
    'MUTANT',
    'YAMA',
    'SPIRIT',
    'GACHA_MURO',
    'PIECE_GACHA_KO',
    'PIECE_GACHA_BAKU',
    ...PORTED_APP_SKILL_CODES,
  ]) {
    piecesByCode[code] = createPiece(code);
  }
  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode,
    skillDefinitions: [],
  };
}

function createPiece(pieceCode: string): PieceDefinition {
  const gachaCharByCode: Record<string, string> = {
    PIECE_GACHA_BAKU: '爆',
    PIECE_GACHA_KO: '膠',
    GACHA_BAKU: '爆',
    GACHA_KOU: '膠',
    GACHA_MURO: '室',
    GACHA_SHITSU: '室',
    PIECE_GACHA_SADAME: '定',
    PIECE_GACHA_AN: '安',
    PIECE_GACHA_SO: '宋',
    PIECE_GACHA_TOU: '灯',
    PIECE_GACHA_HEN: '辺',
    PIECE_GACHA_ITSU: '逸',
    PIECE_GACHA_TO: '逃',
    PIECE_GACHA_SOU: '艸',
    ENN: '炎',
    FLAME: '炎',
  };
  const shopCharByCode: Record<string, string> = {
    TANE: '種',
    SHOP_TANE: '種',
    HAA: '葉',
    LEAF: '葉',
    NAKU: '鳴',
    SHOP_NAKU: '鳴',
    MAI: '舞',
    SHOP_MAI: '舞',
  };
  return {
    pieceCode,
    canonicalCode: pieceCode,
    char: gachaCharByCode[pieceCode] ?? shopCharByCode[pieceCode] ?? pieceCode,
    name: pieceCode,
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
  };
}
