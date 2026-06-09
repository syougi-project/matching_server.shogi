import { describe, expect, test } from 'bun:test';

import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { PORTED_APP_SKILL_CODES } from '@/game/ported-app-skill-codes';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

describe('fire skill hand removal', () => {
  const engine = new BasicRuleEngine();

  test('removes one opponent hand piece when proc succeeds', () => {
    const rules = createFireRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:FIR',
      },
      handsState: {
        black: {},
        white: { FU: 1, KI: 1 },
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

    const originalRandom = Math.random;
    Math.random = () => 0.1;
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '5f', piece: 'FIR' },
    });
    Math.random = originalRandom;

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const whiteHands = result.nextGame.handsState.white;
    const total = (whiteHands.FU ?? 0) + (whiteHands.KI ?? 0);
    expect(total).toBe(1);
    expect(result.nextGame.lastSkillTriggered).toBe(true);
  });
});

function createFireRules(): RuleSnapshot {
  const piecesByCode: Record<string, PieceDefinition> = {};
  for (const code of ['FU', 'KI', 'OU', ...PORTED_APP_SKILL_CODES]) {
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
  const charByCode: Record<string, string> = {
    FIR: '火',
    FU: '歩',
    KI: '金',
    OU: '王',
  };
  return {
    pieceCode,
    canonicalCode: pieceCode,
    char: charByCode[pieceCode] ?? pieceCode,
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
