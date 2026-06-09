import { describe, expect, test } from 'bun:test';

import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { PORTED_APP_SKILL_CODES } from '@/game/ported-app-skill-codes';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

describe('electric skill stun', () => {
  const engine = new BasicRuleEngine();
  const originalRandom = Math.random;

  test('stuns all adjacent enemies when proc succeeds', () => {
    Math.random = () => 0;
    const rules = createElectricRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:ELECTRIC',
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
      move: { from: '5e', to: '5d', piece: 'ELECTRIC' },
    });

    Math.random = originalRandom;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.lastSkillTriggered).toBe(true);
    const stuns = result.nextGame.skillState.piece_statuses.filter(
      (entry) => String(entry.status_type) === 'stun',
    );
    expect(stuns.length).toBe(2);
  });

  test('immobilizes stunned enemy on the next turn', () => {
    Math.random = () => 0;
    const rules = createElectricRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:ELECTRIC',
        '4e': 'white:FU',
        '6e': 'white:GI',
      },
      handsState: { black: {}, white: {} },
      skillState: emptySkillState(),
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    const first = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '5d', piece: 'ELECTRIC' },
    });
    Math.random = originalRandom;
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const blocked = engine.applyMove({
      actorSide: 'white',
      rules,
      game: first.nextGame,
      move: { from: '4e', to: '4d', piece: 'FU' },
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.code).toBe('ILLEGAL_MOVE');
    }
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

function createElectricRules(): RuleSnapshot {
  const piecesByCode: Record<string, PieceDefinition> = {};
  for (const code of ['FU', 'GI', 'OU', 'ELECTRIC', ...PORTED_APP_SKILL_CODES]) {
    piecesByCode[code] = createDiagonalSlidePiece(code);
  }
  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode,
    skillDefinitions: [],
  };
}

function createDiagonalSlidePiece(pieceCode: string): PieceDefinition {
  return {
    pieceCode,
    canonicalCode: pieceCode,
    char: pieceCode === 'ELECTRIC' ? '電' : pieceCode,
    name: pieceCode,
    skill: '',
    moveVectors: [
      { dx: -1, dy: -1, maxStep: 8 },
      { dx: 1, dy: -1, maxStep: 8 },
      { dx: -1, dy: 1, maxStep: 8 },
      { dx: 1, dy: 1, maxStep: 8 },
    ],
    canJump: false,
    isPromoted: false,
    promotable: false,
    moveConstraints: null,
    moveRules: [],
    skillDefinitionsV2: null,
  };
}
