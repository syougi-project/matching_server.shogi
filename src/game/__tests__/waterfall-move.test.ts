import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { intrinsicMoveVectorOverride } from '@/game/shop-piece-move-vectors';
import { normalizePortedSkillPieceCode } from '@/catalog/ported-skill-piece-code';
import type { PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('WATERFALL move vectors', () => {
  test('uses forward slide and lateral one-step only', () => {
    const definition: PieceDefinition = {
      pieceCode: 'PIECE_8CC9287B7E93',
      canonicalCode: 'WATERFALL',
      char: '滝',
      name: '滝',
      skill: '',
      moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
      canJump: false,
      isPromoted: false,
      promotable: false,
      moveConstraints: null,
      moveRules: [],
      skillDefinitionsV2: null,
    };
    expect(intrinsicMoveVectorOverride(definition)).toEqual([
      { dx: 0, dy: -1, maxStep: 8 },
      { dx: -1, dy: 0, maxStep: 1 },
      { dx: 1, dy: 0, maxStep: 1 },
    ]);
  });

  test('normalizes opaque waterfall ids for skill handling', () => {
    expect(normalizePortedSkillPieceCode('PIECE_8CC9287B7E93', '滝')).toBe('WATERFALL');
  });
});

describe('WATERFALL push skill', () => {
  test('sends adjacent enemies to owner hands when proc succeeds', () => {
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      const rules = createWaterfallRules();
      const result = engine.applyMove({
        actorSide: 'black',
        rules,
        game: {
          boardState: {
            '5i': 'black:OU',
            '5a': 'white:OU',
            '5e': 'black:PIECE_8CC9287B7E93',
            '4d': 'white:FU',
            '6d': 'white:GI',
          },
          handsState: { black: {}, white: { FU: 0, GI: 0 } },
          skillState: emptySkillState(),
          turn: 'black',
          moveCount: 0,
          version: 1,
        },
        move: { from: '5e', to: '5d', piece: 'PIECE_8CC9287B7E93', promote: false, drop: false },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.nextGame.lastSkillTriggered).toBe(true);
      expect(result.nextGame.boardState['4d']).toBeUndefined();
      expect(result.nextGame.boardState['6d']).toBeUndefined();
      expect(result.nextGame.handsState.white.FU).toBeGreaterThan(0);
      expect(result.nextGame.handsState.white.GI).toBeGreaterThan(0);
    } finally {
      Math.random = originalRandom;
    }
  });
});

function emptySkillState() {
  return {
    board_hazards: [],
    board_arrow_tiles: [],
    movement_modifiers: [],
    piece_statuses: [],
    piece_defenses: [],
  };
}

function createWaterfallRules(): RuleSnapshot {
  const kingLike: PieceDefinition['moveVectors'] = [
    { dx: -1, dy: -1, maxStep: 1 },
    { dx: 0, dy: -1, maxStep: 1 },
    { dx: 1, dy: -1, maxStep: 1 },
    { dx: -1, dy: 0, maxStep: 1 },
    { dx: 1, dy: 0, maxStep: 1 },
    { dx: -1, dy: 1, maxStep: 1 },
    { dx: 0, dy: 1, maxStep: 1 },
    { dx: 1, dy: 1, maxStep: 1 },
  ];
  const waterfall: PieceDefinition = {
    pieceCode: 'PIECE_8CC9287B7E93',
    canonicalCode: 'WATERFALL',
    char: '滝',
    name: '滝',
    skill: '',
    moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
    canJump: false,
    isPromoted: false,
    promotable: false,
    moveConstraints: null,
    moveRules: [],
    skillDefinitionsV2: null,
  };
  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode: {
      OU: {
        pieceCode: 'OU',
        canonicalCode: 'OU',
        char: '王',
        name: '王',
        skill: '',
        moveVectors: kingLike,
        canJump: false,
        isPromoted: false,
        promotable: false,
        moveConstraints: null,
        moveRules: [],
        skillDefinitionsV2: null,
      },
      FU: {
        pieceCode: 'FU',
        canonicalCode: 'FU',
        char: '歩',
        name: '歩',
        skill: '',
        moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
        canJump: false,
        isPromoted: false,
        promotable: true,
        moveConstraints: null,
        moveRules: [],
        skillDefinitionsV2: null,
      },
      GI: {
        pieceCode: 'GI',
        canonicalCode: 'GI',
        char: '銀',
        name: '銀',
        skill: '',
        moveVectors: [
          { dx: -1, dy: -1, maxStep: 1 },
          { dx: 0, dy: -1, maxStep: 1 },
          { dx: 1, dy: -1, maxStep: 1 },
          { dx: -1, dy: 1, maxStep: 1 },
          { dx: 1, dy: 1, maxStep: 1 },
        ],
        canJump: false,
        isPromoted: false,
        promotable: true,
        moveConstraints: null,
        moveRules: [],
        skillDefinitionsV2: null,
      },
      PIECE_8CC9287B7E93: waterfall,
      WATERFALL: waterfall,
    },
    skillDefinitions: [],
  };
}
