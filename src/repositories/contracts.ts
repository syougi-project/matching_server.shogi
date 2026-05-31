import type {
  ConnectionRecord,
  IntegrationEvent,
  MatchSession,
  QueueEntry,
} from '@/types/domain';
import type { WebSocketServerMessage } from '@/types/protocol';

export interface ConnectionRepository {
  save(connection: ConnectionRecord): Promise<void>;
  findByConnectionId(connectionId: string): Promise<ConnectionRecord | null>;
  findByUserId(userId: string): Promise<ConnectionRecord | null>;
}

export interface QueueRepository {
  save(entry: QueueEntry): Promise<void>;
  findActiveByUserId(userId: string): Promise<QueueEntry | null>;
  findById(queueEntryId: string): Promise<QueueEntry | null>;
  listWaitingBuckets(limit?: number): Promise<number[]>;
  listWaitingByBucket(bucket: number, limit?: number): Promise<QueueEntry[]>;
  reserveWaitingEntry(queueEntryId: string, matchingToken: string): Promise<boolean>;
  releaseReservation(queueEntryId: string, matchingToken: string): Promise<boolean>;
  markMatched(queueEntryId: string, matchId: string, matchedAt: string): Promise<boolean>;
  cancelByUserId(userId: string): Promise<boolean>;
}

export interface MatchRepository {
  save(session: MatchSession): Promise<void>;
  findById(matchId: string): Promise<MatchSession | null>;
  updateGameIfVersion(
    matchId: string,
    expectedVersion: number,
    nextSession: MatchSession,
  ): Promise<boolean>;
}

export interface IntegrationEventRepository {
  save(event: IntegrationEvent): Promise<void>;
  listPending(): Promise<IntegrationEvent[]>;
  markDelivered(eventId: string): Promise<boolean>;
  markFailed(eventId: string, nextAttemptAt: string | null): Promise<boolean>;
}

export type IdempotencyRecord = {
  idempotencyKey: string;
  requestId: string;
  response: WebSocketServerMessage;
  createdAt: string;
  ttl: number;
};

export interface IdempotencyRepository {
  saveIfAbsent(record: IdempotencyRecord): Promise<boolean>;
  findByKey(idempotencyKey: string): Promise<IdempotencyRecord | null>;
}
