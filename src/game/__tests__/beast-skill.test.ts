import { describe, expect, test } from 'bun:test';

import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { PORTED_APP_SKILL_CODES } from '@/game/ported-app-skill-codes';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

describe('beast skill stun', () => {
  const engine = new BasicRuleEngine();

  test('stuns orthogonal adjacent enemies on move', () => {
    const rules = createBeastRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:BEAST',
        '4f': 'white:FU',
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
      move: { from: '5e', to: '5f', piece: 'BEAST' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.lastSkillTriggered).toBe(true);
    const stuns = (result.nextGame.skillState?.piece_statuses ?? []).filter(
      (entry) => String(entry.status_type) === 'stun',
    );
    expect(stuns.length).toBe(1);
    expect(stuns[0]).toMatchObject({ row: 5, col: 5, side: 'white' });
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

function createBeastRules(): RuleSnapshot {
  const piecesByCode: Record<string, PieceDefinition> = {};
  for (const code of ['FU', 'GI', 'KI', 'OU', 'BEAST', ...PORTED_APP_SKILL_CODES]) {
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
    char: pieceCode === 'BEAST' ? '獣' : pieceCode,
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
