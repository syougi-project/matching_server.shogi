import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { PORTED_APP_SKILL_CODES } from '@/game/ported-app-skill-codes';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('SAND linked movement', () => {
  test('moves adjacent ally sand without double-moving the leader', () => {
    const rules = createRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '6e': 'black:SAND',
        '5e': 'black:SAND',
      },
      handsState: { black: {}, white: {} },
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

    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '5d', piece: 'SAND', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5d']).toBe('black:SAND');
    expect(result.nextGame.boardState['6d']).toBe('black:SAND');
    expect(result.nextGame.boardState['4d']).toBeUndefined();
    expect(result.nextGame.boardState['5e']).toBeUndefined();
    expect(result.nextGame.boardState['6e']).toBeUndefined();
  });
});

function createRules(): RuleSnapshot {
  const piecesByCode: Record<string, PieceDefinition> = {
    OU: createPiece('OU'),
  };
  for (const code of PORTED_APP_SKILL_CODES) {
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
  return {
    pieceCode,
    canonicalCode: pieceCode,
    char: pieceCode,
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
