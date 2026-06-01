import { describe, expect, test } from 'bun:test';
import { createServerContext } from '@/server/context';

describe('QueueService', () => {
  test('enters queue with rating bucket', async () => {
    const context = createServerContext();

    const entry = await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1520,
    });

    expect(entry.status).toBe('waiting');
    expect(entry.ratingBucket).toBe(1500);
  });

  test('stores battle setup id when entering queue', async () => {
    const context = createServerContext();

    const entry = await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1520,
      battleSetupId: 'bsetup_1',
    });

    expect(entry.battleSetupId).toBe('bsetup_1');
  });

  test('replaces an existing active queue entry for the same user', async () => {
    const context = createServerContext();

    const first = await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1520,
    });

    const second = await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-2',
      rating: 1600,
    });
    const current = await context.repositories.queue.findActiveByUserId('user-1');
    const old = await context.repositories.queue.findById(first.queueEntryId);

    expect(second.queueEntryId).not.toBe(first.queueEntryId);
    expect(second.connectionId).toBe('conn-2');
    expect(second.ratingBucket).toBe(1600);
    expect(current?.queueEntryId).toBe(second.queueEntryId);
    expect(old?.status).toBe('cancelled');
  });

  test('cancels an active queue entry', async () => {
    const context = createServerContext();

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1520,
    });

    await context.services.queue.cancelQueue('user-1');
    const current = await context.repositories.queue.findActiveByUserId('user-1');

    expect(current).toBeNull();
  });
});
