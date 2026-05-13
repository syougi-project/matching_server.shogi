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

  test('rejects duplicate active queue entries', async () => {
    const context = createServerContext();

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1520,
    });

    await expect(
      context.services.queue.enterQueue({
        userId: 'user-1',
        connectionId: 'conn-2',
        rating: 1600,
      }),
    ).rejects.toMatchObject({ code: 'QUEUE_ALREADY_ACTIVE' });
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
