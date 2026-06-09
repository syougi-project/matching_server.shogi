import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { InMemoryPieceCatalogProvider } from '@/catalog/default-piece-catalog';
import { RuleSnapshotBuilder } from '@/catalog/rule-snapshot';
import type { GameSnapshot } from '@/types/domain';

async function buildRules() {
  return new RuleSnapshotBuilder(new InMemoryPieceCatalogProvider()).buildSnapshot();
}

function baseGame(overrides: Partial<GameSnapshot>): GameSnapshot {
  return {
    boardState: {},
    handsState: { black: {}, white: {} },
    skillState: {
      board_hazards: [],
      board_arrow_tiles: [],
      movement_modifiers: [],
      piece_statuses: [],
      piece_defenses: [],
    },
    turn: 'white',
    moveCount: 1,
    version: 2,
    ...overrides,
  };
}

describe('poison cell landing', () => {
  test('enemy piece can move onto poison cell and is removed', async () => {
    const rules = await buildRules();
    const engine = new BasicRuleEngine();
    const game = baseGame({
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5d': 'white:FU',
      },
      skillState: {
        board_hazards: [
          {
            row: 4,
            col: 4,
            hazard_type: 'poison_cell',
            affects_side: 'white',
            remaining_turns: 4,
          },
        ],
        board_arrow_tiles: [],
        movement_modifiers: [],
        piece_statuses: [],
        piece_defenses: [],
      },
    });

    const result = engine.applyMove({
      game,
      rules,
      actorSide: 'white',
      move: { from: '5d', to: '5e', piece: 'FU' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5e']).toBeUndefined();
  });

  test('poison move creates hazard and enemy landing removes piece', async () => {
    const rules = await buildRules();
    const engine = new BasicRuleEngine();
    let game = baseGame({
      turn: 'black',
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:POISON',
        '5d': 'white:FU',
      },
    });

    const poisoned = engine.applyMove({
      game,
      rules,
      actorSide: 'black',
      move: { from: '5e', to: '5f', piece: 'POISON' },
    });
    expect(poisoned.ok).toBe(true);
    if (!poisoned.ok) return;

    expect(poisoned.nextGame.skillState?.board_hazards?.[0]).toMatchObject({
      row: 4,
      col: 4,
      hazard_type: 'poison_cell',
      affects_side: 'white',
    });

    game = {
      ...poisoned.nextGame,
      turn: 'white',
    };
    const landed = engine.applyMove({
      game,
      rules,
      actorSide: 'white',
      move: { from: '5d', to: '5e', piece: 'FU' },
    });
    expect(landed.ok).toBe(true);
    if (!landed.ok) return;
    expect(landed.nextGame.boardState['5e']).toBeUndefined();
  });

  test('king cannot move onto poison cell', async () => {
    const rules = await buildRules();
    const engine = new BasicRuleEngine();
    const game = baseGame({
      boardState: {
        '5a': 'white:OU',
        '5f': 'black:OU',
      },
      turn: 'black',
      skillState: {
        board_hazards: [
          {
            row: 4,
            col: 4,
            hazard_type: 'poison_cell',
            affects_side: 'black',
            remaining_turns: 4,
          },
        ],
        board_arrow_tiles: [],
        movement_modifiers: [],
        piece_statuses: [],
        piece_defenses: [],
      },
    });

    const result = engine.applyMove({
      game,
      rules,
      actorSide: 'black',
      move: { from: '5f', to: '5e', piece: 'OU' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('ILLEGAL_MOVE');
  });
});
