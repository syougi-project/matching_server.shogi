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

  test('creates multiple matches in one batch', async () => {
    const context = createServerContext();

    for (let index = 1; index <= 4; index += 1) {
      await context.services.queue.enterQueue({
        userId: `user-${index}`,
        connectionId: `conn-${index}`,
        rating: 1500,
      });
    }

    const matches = await context.services.matchmaking.runBatch(2);

    expect(matches).toHaveLength(2);
    expect(new Set(matches.map((match) => match.matchId)).size).toBe(2);
  });

  test('creates only one match when workers run concurrently for the same pair', async () => {
    const context = createServerContext();

    const first = await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });
    const second = await context.services.queue.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1500,
    });

    const results = await Promise.all([
      context.services.matchmaking.runOnce(),
      context.services.matchmaking.runOnce(),
    ]);
    const matches = results.filter((match) => match != null);
    const firstEntry = await context.repositories.queue.findById(first.queueEntryId);
    const secondEntry = await context.repositories.queue.findById(second.queueEntryId);

    expect(matches).toHaveLength(1);
    expect(results.filter((match) => match == null)).toHaveLength(1);
    expect(new Set(matches.map((match) => match!.matchId)).size).toBe(1);

    const activeUser1 = await context.repositories.queue.findActiveByUserId('user-1');
    const activeUser2 = await context.repositories.queue.findActiveByUserId('user-2');
    expect(activeUser1).toBeNull();
    expect(activeUser2).toBeNull();
    expect(firstEntry?.status).toBe('matched');
    expect(secondEntry?.status).toBe('matched');
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

  test('matches players across distant rating buckets when experimental wide rating is enabled', async () => {
    const context = createServerContext();
    expect(context.config.experimentalWideRatingMatch).toBe(true);

    await context.services.queue.enterQueue({
      userId: 'user-low',
      connectionId: 'conn-low',
      rating: 0,
    });
    await context.services.queue.enterQueue({
      userId: 'user-high',
      connectionId: 'conn-high',
      rating: 1500,
    });

    const match = await context.services.matchmaking.runOnce();

    expect(match).not.toBeNull();
    expect(match?.playerBlackProfile.rating).toBe(0);
    expect(match?.playerWhiteProfile.rating).toBe(1500);
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
