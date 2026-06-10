import { describe, expect, test } from 'bun:test';
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

  test('book moves to adjacent ally legal destinations', () => {
    const rules = createRules(['BOOK', 'FU', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:BOOK',
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
      move: { from: '5e', to: '4d', piece: 'BOOK' },
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
