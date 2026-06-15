import { describe, expect, test } from 'bun:test';

import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { PORTED_APP_SKILL_CODES } from '@/game/ported-app-skill-codes';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

describe('heart skill immunity', () => {
  const engine = new BasicRuleEngine();

  test('grants immunity to selected ally for 2 turns via notation', () => {
    const rules = createHeartRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:HEART',
        '5f': 'black:FU',
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
      move: { from: '5e', to: '5d', piece: 'HEART', notation: 'heart_protect:5:4' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.lastSkillTriggered).toBe(true);
    const defense = result.nextGame.skillState?.piece_defenses?.find(
      (entry) => String(entry.mode) === 'immunity',
    );
    expect(defense).toMatchObject({ row: 5, col: 4, side: 'black', remaining_turns: 1 });
  });

  test('does not grant immunity when notation is omitted', () => {
    const rules = createHeartRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:HEART',
        '5f': 'black:FU',
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
      move: { from: '5e', to: '5d', piece: 'HEART' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const defenses = result.nextGame.skillState?.piece_defenses ?? [];
    expect(defenses.length).toBe(0);
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

function createHeartRules(): RuleSnapshot {
  const piecesByCode: Record<string, PieceDefinition> = {};
  for (const code of ['FU', 'GI', 'KI', 'OU', 'HEART', ...PORTED_APP_SKILL_CODES]) {
    piecesByCode[code] = createGoldLikePiece(code);
  }
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
    char: pieceCode === 'HEART' ? '心' : pieceCode,
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
