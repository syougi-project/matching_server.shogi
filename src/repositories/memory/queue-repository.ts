import type { QueueRepository } from '@/repositories/contracts';
import type { QueueEntry } from '@/types/domain';

export class InMemoryQueueRepository implements QueueRepository {
  private readonly byId = new Map<string, QueueEntry>();
  private readonly activeByUserId = new Map<string, string>();

  async save(entry: QueueEntry) {
    this.byId.set(entry.queueEntryId, entry);
    if (isActive(entry.status)) {
      this.activeByUserId.set(entry.userId, entry.queueEntryId);
      return;
    }
    if (this.activeByUserId.get(entry.userId) === entry.queueEntryId) {
      this.activeByUserId.delete(entry.userId);
    }
  }

  async findActiveByUserId(userId: string) {
    const queueEntryId = this.activeByUserId.get(userId);
    if (!queueEntryId) return null;
    return this.byId.get(queueEntryId) ?? null;
  }

  async findById(queueEntryId: string) {
    return this.byId.get(queueEntryId) ?? null;
  }

  async listWaitingBuckets(limit?: number) {
    const buckets = new Set<number>();
    for (const entry of this.byId.values()) {
      if (entry.status === 'waiting') buckets.add(entry.ratingBucket);
    }
    const ordered = Array.from(buckets).sort((a, b) => a - b);
    return limit && limit > 0 ? ordered.slice(0, limit) : ordered;
  }

  async listWaitingByBucket(bucket: number, limit?: number) {
    const entries = Array.from(this.byId.values())
      .filter((entry) => entry.status === 'waiting' && entry.ratingBucket === bucket)
      .sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt));
    return limit && limit > 0 ? entries.slice(0, limit) : entries;
  }

  async reserveWaitingEntry(queueEntryId: string, matchingToken: string) {
    const current = this.byId.get(queueEntryId);
    if (!current || current.status !== 'waiting') return false;
    const next: QueueEntry = { ...current, status: 'matching', matchingToken };
    this.byId.set(queueEntryId, next);
    return true;
  }

  async reserveWaitingPair(
    firstQueueEntryId: string,
    secondQueueEntryId: string,
    matchingToken: string,
  ) {
    if (firstQueueEntryId === secondQueueEntryId) return false;
    const first = this.byId.get(firstQueueEntryId);
    const second = this.byId.get(secondQueueEntryId);
    if (!first || !second || first.status !== 'waiting' || second.status !== 'waiting') {
      return false;
    }
    this.byId.set(firstQueueEntryId, { ...first, status: 'matching', matchingToken });
    this.byId.set(secondQueueEntryId, { ...second, status: 'matching', matchingToken });
    return true;
  }

  async releaseReservation(queueEntryId: string, matchingToken: string) {
    const current = this.byId.get(queueEntryId);
    if (!current || current.status !== 'matching' || current.matchingToken !== matchingToken) {
      return false;
    }
    const next: QueueEntry = { ...current, status: 'waiting', matchingToken: null };
    this.byId.set(queueEntryId, next);
    return true;
  }

  async markMatched(queueEntryId: string, matchId: string, matchedAt: string) {
    const current = this.byId.get(queueEntryId);
    if (!current || current.status !== 'matching') return false;
    const next: QueueEntry = {
      ...current,
      status: 'matched',
      matchId,
      matchedAt,
      matchingToken: null,
    };
    this.byId.set(queueEntryId, next);
    if (this.activeByUserId.get(next.userId) === next.queueEntryId) {
      this.activeByUserId.delete(next.userId);
    }
    return true;
  }

  async cancelByUserId(userId: string) {
    const queueEntryId = this.activeByUserId.get(userId);
    if (!queueEntryId) return false;
    const current = this.byId.get(queueEntryId);
    if (!current || (current.status !== 'waiting' && current.status !== 'matching')) return false;
    const next: QueueEntry = { ...current, status: 'cancelled', matchingToken: null };
    this.byId.set(queueEntryId, next);
    this.activeByUserId.delete(userId);
    return true;
  }
}

function isActive(status: QueueEntry['status']) {
  return status === 'waiting' || status === 'matching';
}
