import { describe, expect, test } from 'bun:test';

import { InMemoryPieceCatalogProvider } from '@/catalog/default-piece-catalog';
import { RuleSnapshotBuilder } from '@/catalog/rule-snapshot';
import { createInitialGameFromBattleSetups } from '@/game/initial-board';

describe('createInitialGameFromBattleSetups', () => {
  test('builds mirrored game state from both player battle setups', async () => {
    const rules = await new RuleSnapshotBuilder(new InMemoryPieceCatalogProvider()).buildSnapshot();

    const game = createInitialGameFromBattleSetups({
      rules,
      blackSetup: {
        battleSetupId: 'bsetup_black',
        ownerUserId: 'user-black',
        status: 'locked',
        name: 'black',
        boardLayout: [{ row: 8, col: 4, pieceId: 1, pieceCode: 'ou' }],
        handsLayout: [{ pieceId: 2, pieceCode: 'fu', count: 2 }],
        selectedPieceIds: [1, 2],
        validationSummary: { boardPieceCount: 1, handPieceCount: 2, totalSelectedPieces: 2 },
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
      whiteSetup: {
        battleSetupId: 'bsetup_white',
        ownerUserId: 'user-white',
        status: 'locked',
        name: 'white',
        boardLayout: [{ row: 8, col: 4, pieceId: 3, pieceCode: 'ou' }],
        handsLayout: [{ pieceId: 4, pieceCode: 'fu', count: 1 }],
        selectedPieceIds: [3, 4],
        validationSummary: { boardPieceCount: 1, handPieceCount: 1, totalSelectedPieces: 2 },
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
    });

    expect(game.boardState['5i']).toBe('black:OU');
    expect(game.boardState['5a']).toBe('white:OU');
    expect(game.handsState.black.FU).toBe(2);
    expect(game.handsState.white.FU).toBe(1);
    expect(game.turn).toBe('black');
    expect(game.version).toBe(1);
  });

  test('ignores setup pieces that are absent from the rule snapshot', async () => {
    const rules = await new RuleSnapshotBuilder(new InMemoryPieceCatalogProvider()).buildSnapshot();

    const game = createInitialGameFromBattleSetups({
      rules,
      blackSetup: {
        battleSetupId: 'bsetup_black',
        ownerUserId: 'user-black',
        status: 'locked',
        name: 'black',
        boardLayout: [{ row: 8, col: 4, pieceId: 1, pieceCode: 'unknown' }],
        handsLayout: [{ pieceId: 2, pieceCode: 'unknown', count: 2 }],
        selectedPieceIds: [1, 2],
        validationSummary: { boardPieceCount: 1, handPieceCount: 2, totalSelectedPieces: 2 },
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
      whiteSetup: {
        battleSetupId: 'bsetup_white',
        ownerUserId: 'user-white',
        status: 'locked',
        name: 'white',
        boardLayout: [],
        handsLayout: [],
        selectedPieceIds: [],
        validationSummary: { boardPieceCount: 0, handPieceCount: 0, totalSelectedPieces: 0 },
        createdAt: '2026-05-10T00:00:00.000Z',
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
    });

    expect(game.boardState['5i']).toBeUndefined();
    expect(game.handsState.black.UNKNOWN).toBeUndefined();
  });
});
