import { describe, expect, test } from 'bun:test';
import { createServerContext } from '@/server/context';
import type { GameSnapshot } from '@/types/domain';

describe('GameCommandService', () => {
  test('rejects stale version moves', async () => {
    const context = createServerContext();

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });
    await context.services.queue.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1500,
    });

    const match = await context.services.matchmaking.runOnce();
    expect(match).not.toBeNull();

    await context.services.gameCommand.makeMove({
      matchId: match!.matchId,
      userId: match!.playerBlackUserId,
      expectedVersion: 1,
      move: { from: '7g', to: '7f', piece: 'FU' },
    });

    await expect(
      context.services.gameCommand.makeMove({
        matchId: match!.matchId,
        userId: match!.playerWhiteUserId,
        expectedVersion: 1,
        move: { from: '3c', to: '3d', piece: 'FU' },
      }),
    ).rejects.toMatchObject({ code: 'VERSION_MISMATCH' });
  });

  test('resign finishes match and emits finish event', async () => {
    const context = createServerContext();

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });
    await context.services.queue.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1500,
    });

    const match = await context.services.matchmaking.runOnce();
    const finished = await context.services.gameCommand.resign(match!.matchId, match!.playerBlackUserId);
    const pending = await context.repositories.integrationEvents.listPending();

    expect(finished.status).toBe('finished');
    expect(finished.winnerUserId).toBe(match!.playerWhiteUserId);
    expect(pending.some((event) => event.eventType === 'match.finished')).toBe(true);
  });

  test('disconnect finishes match and awards win to the opponent', async () => {
    const context = createServerContext();

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });
    await context.services.queue.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1500,
    });

    const match = await context.services.matchmaking.runOnce();
    const disconnected = await context.services.gameCommand.disconnect(
      match!.matchId,
      match!.playerBlackUserId,
    );
    const pending = await context.repositories.integrationEvents.listPending();

    expect(disconnected.status).toBe('finished');
    expect(disconnected.winnerUserId).toBe(match!.playerWhiteUserId);
    expect(disconnected.endReason).toBe('disconnect');
    expect(disconnected.reconnectDeadlineAt).toBeNull();
    expect(disconnected.disconnectedAtBlack).not.toBeNull();
    expect(pending.some((event) => event.eventType === 'match.finished')).toBe(true);
  });

  test('aborts expired reconnect and emits abort event', async () => {
    const context = createServerContext();

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });
    await context.services.queue.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1500,
    });

    const match = await context.services.matchmaking.runOnce();
    await context.repositories.matches.save({
      ...match!,
      reconnectDeadlineAt: '2000-01-01T00:00:00.000Z',
    });

    const aborted = await context.services.gameCommand.abortExpiredReconnect(match!.matchId);
    const pending = await context.repositories.integrationEvents.listPending();

    expect(aborted?.status).toBe('aborted');
    expect(aborted?.endReason).toBe('disconnect_timeout');
    expect(pending.some((event) => event.eventType === 'match.aborted')).toBe(true);
  });

  test('applies a standard pawn move from the initial position', async () => {
    const context = createServerContext();

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });
    await context.services.queue.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1500,
    });

    const match = await context.services.matchmaking.runOnce();
    expect(match).not.toBeNull();

    const updated = await context.services.gameCommand.makeMove({
      matchId: match!.matchId,
      userId: match!.playerBlackUserId,
      expectedVersion: 1,
      move: { from: '7g', to: '7f', piece: 'FU' },
    });

    expect(updated.game.boardState['7f']).toBe('black:FU');
    expect(updated.game.boardState['7g']).toBeUndefined();
    expect(updated.game.turn).toBe('white');
  });

  test('accepts moves when stored board squares use mixed case keys', async () => {
    const context = createServerContext();

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });
    await context.services.queue.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1500,
    });

    const match = await context.services.matchmaking.runOnce();
    expect(match).not.toBeNull();

    await context.repositories.matches.save({
      ...match!,
      game: {
        ...match!.game,
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '7G': 'black:FU',
        },
      },
    });

    const updated = await context.services.gameCommand.makeMove({
      matchId: match!.matchId,
      userId: match!.playerBlackUserId,
      expectedVersion: 1,
      move: { from: '7g', to: '7f', piece: 'FU', promote: false, drop: false },
    });

    expect(updated.game.boardState['7f']).toBe('black:FU');
  });

  test('accepts FU move payload when board stores BFF instance piece codes', async () => {
    const context = createServerContext();

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });
    await context.services.queue.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1500,
    });

    const match = await context.services.matchmaking.runOnce();
    expect(match).not.toBeNull();

    await context.repositories.matches.save({
      ...match!,
      ruleSnapshot: {
        ...match!.ruleSnapshot,
        piecesByCode: {
          ...match!.ruleSnapshot.piecesByCode,
          PIECE_C518B11858F2: {
            pieceCode: 'PIECE_C518B11858F2',
            canonicalCode: 'PAWN',
            sfenCode: 'P',
            char: '歩',
            name: '歩兵',
            skill: '',
            moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
            promotable: true,
          },
          FU: match!.ruleSnapshot.piecesByCode.FU,
        },
      },
      game: {
        ...match!.game,
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '7g': 'black:PIECE_C518B11858F2',
        },
      },
    });

    const updated = await context.services.gameCommand.makeMove({
      matchId: match!.matchId,
      userId: match!.playerBlackUserId,
      expectedVersion: 1,
      move: { from: '7g', to: '7f', piece: 'FU', promote: false, drop: false },
    });

    expect(updated.game.boardState['7f']).toBe('black:FU');
    expect(updated.game.boardState['7g']).toBeUndefined();
  });

  test('rejects illegal backward pawn move', async () => {
    const context = createServerContext();

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });
    await context.services.queue.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1500,
    });

    const match = await context.services.matchmaking.runOnce();
    expect(match).not.toBeNull();

    await expect(
      context.services.gameCommand.makeMove({
        matchId: match!.matchId,
        userId: match!.playerBlackUserId,
        expectedVersion: 1,
        move: { from: '7g', to: '7h', piece: 'FU' },
      }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_MOVE' });
  });

  test('does not treat missing from with drop false as a drop move', async () => {
    const context = createServerContext();

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });
    await context.services.queue.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1500,
    });

    const match = await context.services.matchmaking.runOnce();
    expect(match).not.toBeNull();

    await expect(
      context.services.gameCommand.makeMove({
        matchId: match!.matchId,
        userId: match!.playerBlackUserId,
        expectedVersion: 1,
        move: { to: '7f', piece: 'FU', drop: false, promote: false },
      }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_MOVE' });
  });

  test('accepts legacy client gacha setup piece codes in move payload', async () => {
    const context = createServerContext();

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });
    await context.services.queue.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1500,
    });

    const match = await context.services.matchmaking.runOnce();
    expect(match).not.toBeNull();

    const customGame: GameSnapshot = {
      ...match!.game,
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:PIECE_GACHA_KO',
      },
      handsState: { black: {}, white: {} },
      turn: 'black',
      version: 1,
    };

    await context.repositories.matches.save({
      ...match!,
      game: customGame,
    });

    const updated = await context.services.gameCommand.makeMove({
      matchId: match!.matchId,
      userId: match!.playerBlackUserId,
      expectedVersion: 1,
      move: { from: '5e', to: '5f', piece: 'GACHA_KOU', promote: false, drop: false },
    });

    expect(updated.game.boardState['5f']).toBe('black:GACHA_KOU');
  });

  test('rejects nifu pawn drop', async () => {
    const context = createServerContext();

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });
    await context.services.queue.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1500,
    });

    const match = await context.services.matchmaking.runOnce();
    expect(match).not.toBeNull();

    const customGame: GameSnapshot = {
      ...match!.game,
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '7g': 'black:FU',
      },
      handsState: {
        black: { FU: 1 },
        white: {},
      },
      turn: 'black',
      version: 3,
    };

    await context.repositories.matches.save({
      ...match!,
      game: customGame,
    });

    await expect(
      context.services.gameCommand.makeMove({
        matchId: match!.matchId,
        userId: match!.playerBlackUserId,
        expectedVersion: 3,
        move: { to: '7e', piece: 'FU', drop: true },
      }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_MOVE' });
  });

  test('applies mist skill to send one adjacent enemy to owner hand', async () => {
    const context = createServerContext();

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });
    await context.services.queue.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1500,
    });

    const match = await context.services.matchmaking.runOnce();
    expect(match).not.toBeNull();

    const customGame: GameSnapshot = {
      ...match!.game,
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:MIST',
        '4f': 'white:FU',
      },
      handsState: {
        black: {},
        white: {},
      },
      turn: 'black',
      version: 4,
    };

    await context.repositories.matches.save({
      ...match!,
      game: customGame,
    });

    const updated = await context.services.gameCommand.makeMove({
      matchId: match!.matchId,
      userId: match!.playerBlackUserId,
      expectedVersion: 4,
      move: { from: '5e', to: '5f', piece: 'MIST' },
    });

    expect(updated.game.boardState['4f']).toBeUndefined();
    expect(updated.game.handsState.white.FU).toBe(1);
  });

  test('applies katana skill to capture adjacent enemies after capture', async () => {
    const context = createServerContext();

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });
    await context.services.queue.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1500,
    });

    const match = await context.services.matchmaking.runOnce();
    expect(match).not.toBeNull();

    const customGame: GameSnapshot = {
      ...match!.game,
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5f': 'black:KATANA',
        '5e': 'white:FU',
        '4e': 'white:GI',
        '6e': 'white:KI',
      },
      handsState: {
        black: {},
        white: {},
      },
      turn: 'black',
      version: 7,
    };

    await context.repositories.matches.save({
      ...match!,
      game: customGame,
    });

    const updated = await context.services.gameCommand.makeMove({
      matchId: match!.matchId,
      userId: match!.playerBlackUserId,
      expectedVersion: 7,
      move: { from: '5f', to: '5e', piece: 'KATANA' },
    });

    expect(updated.game.boardState['4e']).toBeUndefined();
    expect(updated.game.boardState['6e']).toBeUndefined();
    expect(updated.game.handsState.black.FU).toBe(1);
    expect(updated.game.handsState.black.GI).toBe(1);
    expect(updated.game.handsState.black.KI).toBe(1);
  });

  test('applies water skill to push adjacent enemies one square away', async () => {
    const context = createServerContext();
    await context.services.queue.enterQueue({ userId: 'user-1', connectionId: 'conn-1', rating: 1500 });
    await context.services.queue.enterQueue({ userId: 'user-2', connectionId: 'conn-2', rating: 1500 });
    const match = await context.services.matchmaking.runOnce();

    await context.repositories.matches.save({
      ...match!,
      game: {
        ...match!.game,
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:SUI',
          '4f': 'white:FU',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        version: 9,
      },
    });

    const updated = await context.services.gameCommand.makeMove({
      matchId: match!.matchId,
      userId: match!.playerBlackUserId,
      expectedVersion: 9,
      move: { from: '5e', to: '5f', piece: 'SUI' },
    });

    expect(updated.game.boardState['4f']).toBeUndefined();
    expect(updated.game.boardState['3f']).toBe('white:FU');
    expect(updated.game.lastSkillTriggered).toBe(true);
  });

  test('applies rainbow skill movement restriction to adjacent enemies', async () => {
    const context = createServerContext();
    await context.services.queue.enterQueue({ userId: 'user-1', connectionId: 'conn-1', rating: 1500 });
    await context.services.queue.enterQueue({ userId: 'user-2', connectionId: 'conn-2', rating: 1500 });
    const match = await context.services.matchmaking.runOnce();

    await context.repositories.matches.save({
      ...match!,
      game: {
        ...match!.game,
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:RAINBOW',
          '4f': 'white:KA',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        version: 10,
      },
    });

    const restricted = await context.services.gameCommand.makeMove({
      matchId: match!.matchId,
      userId: match!.playerBlackUserId,
      expectedVersion: 10,
      move: { from: '5e', to: '5f', piece: 'RAINBOW' },
    });

    expect(restricted.game.skillState?.movement_modifiers?.[0]).toMatchObject({
      side: 'white',
      row: 5,
      col: 5,
      movement_rule: 'orthogonal_step_only',
    });

    await expect(
      context.services.gameCommand.makeMove({
        matchId: match!.matchId,
        userId: match!.playerWhiteUserId,
        expectedVersion: restricted.game.version,
        move: { from: '4f', to: '3g', piece: 'KA' },
      }),
    ).rejects.toMatchObject({ code: 'ILLEGAL_MOVE' });
  });

  test('applies poison skill trail and removes enemy landing on poison cell', async () => {
    const context = createServerContext();
    await context.services.queue.enterQueue({ userId: 'user-1', connectionId: 'conn-1', rating: 1500 });
    await context.services.queue.enterQueue({ userId: 'user-2', connectionId: 'conn-2', rating: 1500 });
    const match = await context.services.matchmaking.runOnce();

    await context.repositories.matches.save({
      ...match!,
      game: {
        ...match!.game,
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:POISON',
          '5d': 'white:FU',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        version: 11,
      },
    });

    const poisoned = await context.services.gameCommand.makeMove({
      matchId: match!.matchId,
      userId: match!.playerBlackUserId,
      expectedVersion: 11,
      move: { from: '5e', to: '5f', piece: 'POISON' },
    });

    expect(poisoned.game.skillState?.board_hazards?.[0]).toMatchObject({
      row: 4,
      col: 4,
      hazard_type: 'poison_cell',
      affects_side: 'white',
    });

    const updated = await context.services.gameCommand.makeMove({
      matchId: match!.matchId,
      userId: match!.playerWhiteUserId,
      expectedVersion: poisoned.game.version,
      move: { from: '5d', to: '5e', piece: 'FU' },
    });

    expect(updated.game.boardState['5e']).toBeUndefined();
  });

  test('applies glue skill so adjacent ally follows the same move vector', async () => {
    const context = createServerContext();
    await context.services.queue.enterQueue({ userId: 'user-1', connectionId: 'conn-1', rating: 1500 });
    await context.services.queue.enterQueue({ userId: 'user-2', connectionId: 'conn-2', rating: 1500 });
    const match = await context.services.matchmaking.runOnce();

    await context.repositories.matches.save({
      ...match!,
      game: {
        ...match!.game,
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'black:SUI',
          '5d': 'black:GACHA_KOU',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        version: 12,
      },
    });

    const updated = await context.services.gameCommand.makeMove({
      matchId: match!.matchId,
      userId: match!.playerBlackUserId,
      expectedVersion: 12,
      move: { from: '5e', to: '4e', piece: 'SUI' },
    });

    expect(updated.game.boardState['5d']).toBeUndefined();
    expect(updated.game.boardState['4d']).toBe('black:GACHA_KOU');
  });
});
