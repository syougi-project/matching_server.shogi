import { describe, expect, test } from 'bun:test';
import { createServerContext } from '@/server/context';
import { handleWebSocketMessage, pollMatchmaking } from '@/server/handlers/ws-message';

describe('handleWebSocketMessage', () => {
  test('enters queue through websocket handler', async () => {
    const context = createServerContext();

    const response = await handleWebSocketMessage(context, 'conn-1', {
      action: 'enter_queue',
      requestId: 'req-1',
      userId: 'user-1',
      rating: 1520,
      battleSetupId: 'bsetup_1',
    });

    expect(response.type).toBe('queue_entered');
    if (response.type === 'queue_entered') {
      expect(response.ratingBucket).toBe(1500);
    }
  });

  test('returns state_resync_required on stale move version', async () => {
    const context = createServerContext();

    await handleWebSocketMessage(context, 'conn-1', {
      action: 'enter_queue',
      requestId: 'req-1',
      userId: 'user-1',
      rating: 1500,
    });
    await handleWebSocketMessage(context, 'conn-2', {
      action: 'enter_queue',
      requestId: 'req-2',
      userId: 'user-2',
      rating: 1500,
    });

    const match = await context.services.matchmaking.runOnce();
    await context.services.gameCommand.makeMove({
      matchId: match!.matchId,
      userId: match!.playerBlackUserId,
      expectedVersion: 1,
      move: { from: '7g', to: '7f', piece: 'FU' },
    });

    const response = await handleWebSocketMessage(context, 'conn-2', {
      action: 'make_move',
      requestId: 'req-3',
      userId: match!.playerWhiteUserId,
      matchId: match!.matchId,
      expectedVersion: 1,
      move: { from: '3c', to: '3d', piece: 'FU' },
    });

    expect(response).toEqual({
      type: 'state_resync_required',
      matchId: match!.matchId,
      code: 'VERSION_MISMATCH',
      currentVersion: 2,
    });
  });

  test('returns game_finished on resign', async () => {
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

    const response = await handleWebSocketMessage(context, 'conn-1', {
      action: 'resign',
      requestId: 'req-4',
      userId: match!.playerBlackUserId,
      matchId: match!.matchId,
    });

    expect(response).toEqual({
      type: 'game_finished',
      matchId: match!.matchId,
      status: 'finished',
      winnerUserId: match!.playerWhiteUserId,
      reason: 'resign',
    });
  });
});

describe('pollMatchmaking', () => {
  test('returns match_found for a matched user', async () => {
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

    const result = await pollMatchmaking(context, 'user-1');

    expect(result?.type).toBe('match_found');
    expect(result?.role).toBe('black');
  });

  test('returns null when user is not part of created match', async () => {
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

    const result = await pollMatchmaking(context, 'user-9');

    expect(result).toBeNull();
  });
});
