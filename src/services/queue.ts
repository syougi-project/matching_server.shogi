import { DomainError } from '@/lib/errors';
import { createId } from '@/lib/id';
import { addSeconds, nowIso } from '@/lib/time';
import type { MatchingServerConfig } from '@/lib/config';
import type { QueueRepository } from '@/repositories/contracts';
import type { QueueEntry } from '@/types/domain';

export class QueueService {
  constructor(
    private readonly queueRepository: QueueRepository,
    private readonly config: MatchingServerConfig,
  ) {}

  async enterQueue(input: {
    userId: string;
    displayName?: string;
    connectionId: string;
    rating: number;
    region?: string;
    battleSetupId?: string;
  }) {
    const existing = await this.queueRepository.findActiveByUserId(input.userId);
    if (existing) {
      if (existing.status === 'matching') {
        throw new DomainError(
          'QUEUE_MATCHING_IN_PROGRESS',
          'The queue entry is already being matched.',
        );
      }
      await this.queueRepository.cancelByUserId(input.userId);
    }

    const now = nowIso();
    const displayName = (input.displayName ?? '').trim() || input.userId;
    const queueEntry: QueueEntry = {
      queueEntryId: createId('queue'),
      userId: input.userId,
      displayName,
      rating: input.rating,
      ratingBucket: computeRatingBucket(input.rating, this.config.ratingBucketSize),
      status: 'waiting',
      enqueuedAt: now,
      matchingToken: null,
      connectionId: input.connectionId,
      region: input.region ?? null,
      matchedAt: null,
      matchId: null,
      expiresAt: addSeconds(now, this.config.queueTtlSeconds),
      battleSetupId: input.battleSetupId ?? null,
    };

    await this.queueRepository.save(queueEntry);
    return queueEntry;
  }

  async cancelQueue(userId: string) {
    const cancelled = await this.queueRepository.cancelByUserId(userId);
    if (!cancelled) {
      throw new DomainError('QUEUE_NOT_FOUND', 'No cancellable queue entry exists for the user.');
    }
  }
}

export function computeRatingBucket(rating: number, bucketSize: number) {
  const safeRating = Number.isFinite(rating) ? Math.max(0, Math.floor(rating)) : 0;
  return Math.floor(safeRating / bucketSize) * bucketSize;
}
