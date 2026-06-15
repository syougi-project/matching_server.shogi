import { describe, expect, test } from 'bun:test';

import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { mergeSkillDefinitions } from '@/game/skill-definitions';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('holy sword capture evade', () => {
  test('sidesteps to the only open horizontal square when captured', () => {
    const rules = createRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:HOLY_SWORD',
        '6e': 'black:FU',
        '5d': 'white:FU',
      },
      handsState: { black: {}, white: {} },
      skillState: emptySkillState(),
      turn: 'white',
      moveCount: 0,
      version: 1,
    };

    const result = engine.applyMove({
      actorSide: 'white',
      rules,
      game,
      move: { from: '5d', to: '5e', piece: 'FU' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5e']).toBe('white:FU');
    expect(result.nextGame.boardState['4e']).toBe('black:HOLY_SWORD');
    expect(result.nextGame.handsState.white.HOLY_SWORD ?? 0).toBe(0);
  });

  test('sidesteps to one of two open horizontal squares when captured', () => {
    const rules = createRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:HOLY_SWORD',
        '5d': 'white:FU',
      },
      handsState: { black: {}, white: {} },
      skillState: emptySkillState(),
      turn: 'white',
      moveCount: 0,
      version: 1,
    };

    const result = engine.applyMove({
      actorSide: 'white',
      rules,
      game,
      move: { from: '5d', to: '5e', piece: 'FU' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5e']).toBe('white:FU');
    const evadeSquare = result.nextGame.boardState['4e'] ?? result.nextGame.boardState['6e'];
    expect(evadeSquare).toBe('black:HOLY_SWORD');
    expect(result.nextGame.handsState.white.HOLY_SWORD ?? 0).toBe(0);
  });

  test('is captured when both horizontal squares are occupied', () => {
    const rules = createRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:HOLY_SWORD',
        '4e': 'black:FU',
        '6e': 'black:KI',
        '5d': 'white:FU',
      },
      handsState: { black: {}, white: {} },
      skillState: emptySkillState(),
      turn: 'white',
      moveCount: 0,
      version: 1,
    };

    const result = engine.applyMove({
      actorSide: 'white',
      rules,
      game,
      move: { from: '5d', to: '5e', piece: 'FU' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5e']).toBe('white:FU');
    expect(result.nextGame.boardState['4e']).toBe('black:FU');
    expect(result.nextGame.boardState['6e']).toBe('black:KI');
    expect(result.nextGame.handsState.white.HOLY_SWORD ?? 0).toBe(1);
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

function createRules(): RuleSnapshot {
  const piecesByCode: Record<string, PieceDefinition> = {};
  for (const code of ['FU', 'KI', 'OU', 'HOLY_SWORD']) {
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
    FU: '歩',
    KI: '金',
    OU: '王',
    HOLY_SWORD: '剣',
  };
  const vectors =
    code === 'HOLY_SWORD'
      ? [
          { dx: -1, dy: 0, maxStep: 8 },
          { dx: 1, dy: 0, maxStep: 8 },
          { dx: 0, dy: -1, maxStep: 8 },
          { dx: 0, dy: 1, maxStep: 8 },
        ]
      : code === 'OU'
        ? [
            { dx: -1, dy: -1, maxStep: 1 },
            { dx: 0, dy: -1, maxStep: 1 },
            { dx: 1, dy: -1, maxStep: 1 },
            { dx: -1, dy: 0, maxStep: 1 },
            { dx: 1, dy: 0, maxStep: 1 },
            { dx: -1, dy: 1, maxStep: 1 },
            { dx: 0, dy: 1, maxStep: 1 },
            { dx: 1, dy: 1, maxStep: 1 },
          ]
        : code === 'KI'
          ? [
              { dx: -1, dy: -1, maxStep: 1 },
              { dx: 0, dy: -1, maxStep: 1 },
              { dx: 1, dy: -1, maxStep: 1 },
              { dx: -1, dy: 0, maxStep: 1 },
              { dx: 1, dy: 0, maxStep: 1 },
              { dx: 0, dy: 1, maxStep: 1 },
            ]
          : [{ dx: 0, dy: -1, maxStep: 1 }];
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
