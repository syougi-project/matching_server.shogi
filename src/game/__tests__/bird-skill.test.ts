import { describe, expect, test } from 'bun:test';

import { normalizePortedSkillPieceCode } from '@/catalog/ported-skill-piece-code';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { PORTED_APP_SKILL_CODES } from '@/game/ported-app-skill-codes';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

describe('bird skill transport', () => {
  const engine = new BasicRuleEngine();

  test('moves a random ally to the cell directly behind the bird after a lateral move', () => {
    const rules = createBirdRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:BIRD',
        '3e': 'black:FU',
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
      move: { from: '5e', to: '5f', piece: 'BIRD' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.lastSkillTriggered).toBe(true);
    expect(result.nextGame.boardState['3e']).toBeUndefined();
    expect(result.nextGame.boardState['5g']).toBe('black:FU');
    expect(result.nextGame.boardState['5f']).toBe('black:BIRD');
  });

  test('does not transport when the cell behind the bird is occupied', () => {
    const rules = createBirdRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:BIRD',
        '5g': 'black:KI',
        '3e': 'black:FU',
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
      move: { from: '5e', to: '5f', piece: 'BIRD' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['3e']).toBe('black:FU');
    expect(result.nextGame.boardState['5g']).toBe('black:KI');
  });

  test('normalizes opaque bird ids for skill handling', () => {
    expect(normalizePortedSkillPieceCode('PIECE_29ECAB1EF3C3', '禽')).toBe('BIRD');
  });

  test('moves a random ally when bird uses opaque instance id on board', () => {
    const rules = createOpaqueBirdRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:PIECE_29ECAB1EF3C3',
        '3e': 'black:FU',
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
      move: { from: '5e', to: '5f', piece: 'PIECE_29ECAB1EF3C3' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.lastSkillTriggered).toBe(true);
    expect(result.nextGame.boardState['3e']).toBeUndefined();
    expect(result.nextGame.boardState['5g']).toBe('black:FU');
    expect(result.nextGame.boardState['5f']).toBe('black:BIRD');
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

function createBirdRules(): RuleSnapshot {
  const piecesByCode: Record<string, PieceDefinition> = {};
  for (const code of ['FU', 'GI', 'KI', 'OU', 'BIRD', ...PORTED_APP_SKILL_CODES]) {
    piecesByCode[code] = createGoldLikePiece(code);
  }
  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode,
    skillDefinitions: [],
  };
}

function createOpaqueBirdRules(): RuleSnapshot {
  const bird: PieceDefinition = {
    pieceCode: 'PIECE_29ECAB1EF3C3',
    canonicalCode: 'BIRD',
    char: '禽',
    name: '禽',
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
  const piecesByCode: Record<string, PieceDefinition> = {
    FU: createGoldLikePiece('FU'),
    OU: createGoldLikePiece('OU'),
    PIECE_29ECAB1EF3C3: bird,
    BIRD: bird,
  };
  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode,
    skillDefinitions: [],
  };
}

function createGoldLikePiece(pieceCode: string): PieceDefinition {
  return {
    pieceCode,
    canonicalCode: pieceCode,
    char: pieceCode === 'BIRD' ? '禽' : pieceCode,
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
