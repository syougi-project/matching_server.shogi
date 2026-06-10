import { describe, expect, test } from 'bun:test';

import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { PORTED_APP_SKILL_CODES } from '@/game/ported-app-skill-codes';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

describe('time skill stun', () => {
  const engine = new BasicRuleEngine();
  const originalRandom = Math.random;

  test('stuns adjacent enemies on time_skill_only move', () => {
    Math.random = () => 0;
    const rules = createTimeRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:TIME',
        '4e': 'white:FU',
        '6e': 'white:GI',
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
      move: { from: '5e', to: '5e', piece: 'TIME', notation: 'time_skill_only' },
    });

    Math.random = originalRandom;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.lastSkillTriggered).toBe(true);
    const stuns = (result.nextGame.skillState?.piece_statuses ?? []).filter(
      (entry) => String(entry.status_type) === 'stun',
    );
    expect(stuns.length).toBe(2);
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

function createTimeRules(): RuleSnapshot {
  const piecesByCode: Record<string, PieceDefinition> = {};
  for (const code of ['FU', 'GI', 'OU', 'TIME', ...PORTED_APP_SKILL_CODES]) {
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
    char: pieceCode === 'TIME' ? '時' : pieceCode,
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
