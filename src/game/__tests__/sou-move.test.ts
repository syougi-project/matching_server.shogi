import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import type { PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('GACHA_SOU forward two-step moves', () => {
  test('allows forward two-step move even when catalog vectors are forward-only', () => {
    const rules = createSouRules();
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:GACHA_SOU',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '5c', piece: 'GACHA_SOU', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5c']).toBe('black:GACHA_SOU');
    expect(result.nextGame.boardState['5e']).toBeUndefined();
  });

  test('allows forward one-step move', () => {
    const rules = createSouRules();
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:GACHA_SOU',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '5d', piece: 'GACHA_SOU', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
  });

  test('creates pit_cell hazards with 2-turn duration on move', () => {
    const rules = createSouRules();
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:GACHA_SOU',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '5d', piece: 'GACHA_SOU', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hazards = result.nextGame.skillState?.board_hazards ?? [];
    const pitCells = hazards.filter(
      (entry) => String((entry as { hazard_type?: string }).hazard_type) === 'pit_cell',
    );
    expect(pitCells.length).toBeGreaterThan(0);
    for (const entry of pitCells) {
      // 着手後に tickSkillStateDurations が1回走るため、2ターン設定は残り1として見える。
      expect((entry as { remaining_turns?: number }).remaining_turns).toBe(1);
    }
  });
});

function createSouRules(): RuleSnapshot {
  const sou: PieceDefinition = {
    pieceCode: 'GACHA_SOU',
    canonicalCode: 'GACHA_SOU',
    char: '艸',
    name: '艸',
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
        moveVectors: [{ dx: -1, dy: -1, maxStep: 1 }],
        canJump: false,
        isPromoted: false,
        promotable: false,
        moveConstraints: null,
        moveRules: [],
        skillDefinitionsV2: null,
      },
      GACHA_SOU: sou,
    },
    skillDefinitions: [],
  };
}
