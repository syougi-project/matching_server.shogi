import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { mergeSkillDefinitions } from '@/game/skill-definitions';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('people piece online moves', () => {
  test('people can move orthogonally one step', () => {
    const rules = createRules(['PEOPLE', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:PEOPLE',
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
      move: { from: '5e', to: '5d', piece: 'PEOPLE' },
    });
    expect(result.ok).toBe(true);
  });

  test('people gain diagonal moves when ally field is on board', () => {
    const rules = createRules(['PEOPLE', 'FIELD', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:PEOPLE',
        '1a': 'black:FIELD',
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
      move: { from: '5e', to: '4d', piece: 'PEOPLE' },
    });
    expect(result.ok).toBe(true);
  });

  test('field piece cannot move', () => {
    const rules = createRules(['FIELD', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:FIELD',
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
      move: { from: '5e', to: '5d', piece: 'FIELD' },
    });
    expect(result.ok).toBe(false);
  });

  test('field piece with ZTA code and knight catalog vectors cannot move', () => {
    const rules = createRules(['OU']);
    rules.piecesByCode.ZTA = {
      pieceCode: 'ZTA',
      canonicalCode: 'FIELD',
      sfenCode: 'ZTA',
      char: '畑',
      name: '畑',
      skill: '',
      moveVectors: [
        { dx: -1, dy: -2, maxStep: 1 },
        { dx: 1, dy: -2, maxStep: 1 },
      ],
      moveRules: [],
      moveConstraints: null,
      promotable: false,
      skillDefinitionsV2: null,
    };
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:ZTA',
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
      move: { from: '5e', to: '3d', piece: 'ZTA' },
    });
    expect(result.ok).toBe(false);
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
  for (const code of ['FU', 'OU', ...codes]) {
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
    PEOPLE: '民',
    FIELD: '畑',
    HOUSE: '家',
    OU: '王',
    FU: '歩',
  };
  return {
    pieceCode: code,
    canonicalCode: code,
    sfenCode: code,
    char: charByCode[code] ?? code,
    name: code,
    skill: '',
    moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
    moveRules: [],
    moveConstraints: null,
    promotable: false,
    skillDefinitionsV2: null,
  };
}
