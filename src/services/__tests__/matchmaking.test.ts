import { describe, expect, test } from 'bun:test';
import { createServerContext } from '@/server/context';
import { expandBuckets, roleForUser } from '@/services/matchmaking';

describe('MatchmakingService', () => {
  test('creates a match from queued players and emits a started event', async () => {
    const context = createServerContext();

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1520,
    });
    await context.services.queue.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1580,
    });

    const match = await context.services.matchmaking.runOnce();
    const pending = await context.repositories.integrationEvents.listPending();

    expect(match).not.toBeNull();
    expect(match?.status).toBe('started');
    expect(match?.ruleSnapshot.piecesByCode.FU?.pieceCode).toBe('FU');
    expect(pending).toHaveLength(1);
    expect(pending[0]?.eventType).toBe('match.started');
  });

  test('expands buckets from nearest outward', () => {
    expect(expandBuckets(1500, 100, [1300, 1400, 1500, 1700])).toEqual([1500, 1400, 1300, 1700]);
  });

  test('returns null when no opponent exists and keeps queue active', async () => {
    const context = createServerContext();

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });

    const match = await context.services.matchmaking.runOnce();
    const entry = await context.repositories.queue.findActiveByUserId('user-1');

    expect(match).toBeNull();
    expect(entry?.status).toBe('waiting');
  });

  test('resolves user role from match', async () => {
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

    expect(roleForUser(match!, match!.playerBlackUserId)).toBe('black');
    expect(roleForUser(match!, match!.playerWhiteUserId)).toBe('white');
    expect(roleForUser(match!, 'unknown')).toBeNull();
  });
});
