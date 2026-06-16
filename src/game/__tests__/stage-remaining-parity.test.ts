import { describe, expect, test } from 'bun:test';
import { normalizePortedSkillPieceCode } from '@/catalog/ported-skill-piece-code';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { mergeSkillDefinitions } from '@/game/skill-definitions';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('remaining stage pieces parity', () => {
  test('machine borrows left ally move vectors', () => {
    const rules = createRules(['MACHINE', 'FU', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:MACHINE',
        '4e': 'black:FU',
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
      move: { from: '5e', to: '5d', piece: 'MACHINE' },
    });
    expect(result.ok).toBe(true);
  });

  test('yang with ally yin on same row cannot be captured', () => {
    const rules = createRules(['YANG', 'YIN', 'FU', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'white:YANG',
        '3e': 'white:YIN',
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

  test('pig allows 2-square orthogonal move before inheriting enemy movement', () => {
    const rules = createRules(['PIG', 'FU', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:PIG',
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
      move: { from: '5e', to: '5c', piece: 'PIG' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5c']).toBe('black:PIG');
    expect(result.nextGame.boardState['5e']).toBeUndefined();
  });

  test('pig inherits captured piece movement code', () => {
    const rules = createRules(['PIG', 'FU', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:PIG',
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
      move: { from: '5e', to: '5d', piece: 'PIG' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5d']).toContain('>FU');
  });

  test('opaque pig id allows 2-square orthogonal move via intrinsic override', () => {
    expect(normalizePortedSkillPieceCode('PIECE_3EFA5702E75B', '豚')).toBe('PIG');

    const rules = createOpaquePigRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:PIECE_3EFA5702E75B',
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
      move: { from: '5e', to: '5c', piece: 'PIECE_3EFA5702E75B' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5c']).toBe('black:PIG');
    expect(result.nextGame.boardState['5e']).toBeUndefined();
  });

  test('book uses orthogonal fallback when no enemy move was recorded', () => {
    const rules = createRules(['BOOK', 'FU', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:BOOK',
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
      move: { from: '5e', to: '5d', piece: 'BOOK' },
    });
    expect(result.ok).toBe(true);
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

function createOpaquePigRules(): RuleSnapshot {
  const pig: PieceDefinition = {
    pieceCode: 'PIECE_3EFA5702E75B',
    canonicalCode: 'PIG',
    sfenCode: 'PIG',
    char: '豚',
    name: '豚',
    skill: '',
    moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
    moveRules: [],
    moveConstraints: null,
    promotable: false,
    skillDefinitionsV2: null,
  };
  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode: {
      FU: createPiece('FU'),
      OU: createPiece('OU'),
      PIECE_3EFA5702E75B: pig,
      PIG: { ...pig, pieceCode: 'PIG', canonicalCode: 'PIG' },
    },
    skillDefinitions: mergeSkillDefinitions([]),
  };
}

function createPiece(code: string): PieceDefinition {
  const charByCode: Record<string, string> = {
    MACHINE: '機',
    YANG: '陽',
    YIN: '陰',
    PIG: '豚',
    BOOK: '書',
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
      : code === 'MACHINE' || code === 'BOOK' || code === 'PIG'
        ? [{ dx: 0, dy: -1, maxStep: 1 }]
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
