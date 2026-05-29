export type DynamoRuntimeTableNames = {
  connections: string;
  queue: string;
  queueLookup: string;
  matches: string;
  moves: string;
  idempotency: string;
  outbox: string;
};

export type RuntimeTtlPolicy = {
  connectionTtlSeconds: number;
  queueTtlSeconds: number;
  matchTtlSeconds: number;
  idempotencyTtlSeconds: number;
  outboxTtlSeconds: number;
};

export const defaultRuntimeTtlPolicy: RuntimeTtlPolicy = {
  connectionTtlSeconds: 6 * 60 * 60,
  queueTtlSeconds: 5 * 60,
  matchTtlSeconds: 24 * 60 * 60,
  idempotencyTtlSeconds: 24 * 60 * 60,
  outboxTtlSeconds: 7 * 24 * 60 * 60,
};

export function ttlEpochSeconds(nowMs: number, ttlSeconds: number) {
  return Math.floor(nowMs / 1000) + ttlSeconds;
}

export function queueStatusBucket(status: string, ratingBucket: number) {
  return `${status}#${ratingBucket}`;
}

export function enqueuedAtQueueEntryId(enqueuedAt: string, queueEntryId: string) {
  return `${enqueuedAt}#${queueEntryId}`;
}
