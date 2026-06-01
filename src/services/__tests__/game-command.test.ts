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
});
