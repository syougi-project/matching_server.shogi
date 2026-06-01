import type {
  ConnectionRepository,
  IdempotencyRecord,
  IdempotencyRepository,
  IntegrationEventRepository,
  MatchRepository,
  QueueRepository,
} from '@/repositories/contracts';
import {
  getCommand,
  isConditionalCheckFailed,
  putCommand,
  queryCommand,
  updateCommand,
  deleteCommand,
  type DynamoDocumentClientLike,
} from '@/repositories/dynamodb/client';
import {
  enqueuedAtQueueEntryId,
  queueStatusBucket,
  ttlEpochSeconds,
  type DynamoRuntimeTableNames,
  type RuntimeTtlPolicy,
} from '@/repositories/dynamodb/schema';
import type { ConnectionRecord, IntegrationEvent, MatchSession, QueueEntry } from '@/types/domain';

type DynamoRuntimeRepositoryOptions = {
  client: DynamoDocumentClientLike;
  tables: DynamoRuntimeTableNames;
  ttl: RuntimeTtlPolicy;
};

export class DynamoConnectionRepository implements ConnectionRepository {
  constructor(private readonly options: DynamoRuntimeRepositoryOptions) {}

  async save(connection: ConnectionRecord) {
    await this.options.client.send(
      putCommand({
        TableName: this.options.tables.connections,
        Item: {
          ...connection,
          userKey: connection.userId,
          ttl: ttlEpochSeconds(Date.now(), this.options.ttl.connectionTtlSeconds),
        },
      }),
    );
  }

  async findByConnectionId(connectionId: string) {
    const result = await this.options.client.send<{ Item?: ConnectionRecord }>(
      getCommand({
        TableName: this.options.tables.connections,
        Key: { connectionId },
      }),
    );
    return result.Item ?? null;
  }

  async findByUserId(userId: string) {
    const result = await this.options.client.send<{ Items?: ConnectionRecord[] }>(
      queryCommand({
        TableName: this.options.tables.connections,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userKey = :userId',
        ExpressionAttributeValues: { ':userId': userId },
      }),
    );
    return (
      (result.Items ?? [])
        .filter((connection) => connection.status === 'connected')
        .sort((a, b) => b.connectedAt.localeCompare(a.connectedAt))[0] ?? null
    );
  }
}

export class DynamoQueueRepository implements QueueRepository {
  constructor(private readonly options: DynamoRuntimeRepositoryOptions) {}

  async save(entry: QueueEntry) {
    const ttl = entry.expiresAt
      ? Math.floor(new Date(entry.expiresAt).getTime() / 1000)
      : ttlEpochSeconds(Date.now(), this.options.ttl.queueTtlSeconds);
    await this.options.client.send(
      putCommand({
        TableName: this.options.tables.queue,
        Item: { ...entry, activeUserId: activeUserId(entry), ttl },
        ConditionExpression: 'attribute_not_exists(queueEntryId)',
      }),
    );
    if (entry.status === 'waiting') {
      await this.putQueueLookup(entry, ttl);
    }
  }

  async findActiveByUserId(userId: string) {
    const result = await this.options.client.send<{ Items?: QueueEntry[] }>(
      queryCommand({
        TableName: this.options.tables.queue,
        IndexName: 'activeUserId-index',
        KeyConditionExpression: 'activeUserId = :userId',
        ExpressionAttributeValues: { ':userId': userId },
      }),
    );
    return (
      (result.Items ?? [])
        .filter((entry) => !isExpired(entry.expiresAt))
        .sort((a, b) => b.enqueuedAt.localeCompare(a.enqueuedAt))[0] ?? null
    );
  }

  async findById(queueEntryId: string) {
    const result = await this.options.client.send<{ Item?: QueueEntry }>(
      getCommand({
        TableName: this.options.tables.queue,
        Key: { queueEntryId },
      }),
    );
    return result.Item ?? null;
  }

  async listWaitingBuckets(limit?: number) {
    const result = await this.options.client.send<{ Items?: Array<{ ratingBucket: number }> }>(
      queryCommand({
        TableName: this.options.tables.queueLookup,
        IndexName: 'waiting-buckets-index',
        KeyConditionExpression: 'queueStatus = :status',
        ExpressionAttributeValues: { ':status': 'waiting' },
      }),
    );
    const buckets = Array.from(new Set((result.Items ?? []).map((item) => item.ratingBucket))).sort(
      (a, b) => a - b,
    );
    return limit && limit > 0 ? buckets.slice(0, limit) : buckets;
  }

  async listWaitingByBucket(bucket: number, limit?: number) {
    const result = await this.options.client.send<{ Items?: Array<{ queueEntryId: string }> }>(
      queryCommand({
        TableName: this.options.tables.queueLookup,
        KeyConditionExpression: 'statusBucket = :statusBucket',
        ExpressionAttributeValues: { ':statusBucket': queueStatusBucket('waiting', bucket) },
        ScanIndexForward: true,
      }),
    );
    const entries = await Promise.all(
      (result.Items ?? []).map((item) => this.findById(item.queueEntryId)),
    );
    const waiting = entries
      .filter(
        (entry): entry is QueueEntry =>
          entry != null && entry.status === 'waiting' && !isExpired(entry.expiresAt),
      )
      .sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt));
    return limit && limit > 0 ? waiting.slice(0, limit) : waiting;
  }

  async reserveWaitingEntry(queueEntryId: string, matchingToken: string) {
    const entry = await this.findById(queueEntryId);
    try {
      await this.options.client.send(
        updateCommand({
          TableName: this.options.tables.queue,
          Key: { queueEntryId },
          ConditionExpression: '#status = :waiting',
          UpdateExpression: 'SET #status = :matching, matchingToken = :matchingToken',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':waiting': 'waiting',
            ':matching': 'matching',
            ':matchingToken': matchingToken,
          },
        }),
      );
      if (entry) await this.deleteQueueLookup(entry);
      return true;
    } catch (error) {
      if (isConditionalCheckFailed(error)) return false;
      throw error;
    }
  }

  async releaseReservation(queueEntryId: string, matchingToken: string) {
    const entry = await this.findById(queueEntryId);
    try {
      await this.options.client.send(
        updateCommand({
          TableName: this.options.tables.queue,
          Key: { queueEntryId },
          ConditionExpression: '#status = :matching AND matchingToken = :matchingToken',
          UpdateExpression: 'SET #status = :waiting REMOVE matchingToken',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':matching': 'matching',
            ':waiting': 'waiting',
            ':matchingToken': matchingToken,
          },
        }),
      );
      if (entry) await this.putWaitingQueueLookup(entry);
      return true;
    } catch (error) {
      if (isConditionalCheckFailed(error)) return false;
      throw error;
    }
  }

  async markMatched(queueEntryId: string, matchId: string, matchedAt: string) {
    const entry = await this.findById(queueEntryId);
    try {
      await this.options.client.send(
        updateCommand({
          TableName: this.options.tables.queue,
          Key: { queueEntryId },
          ConditionExpression: '#status = :matching',
          UpdateExpression:
            'SET #status = :matched, matchId = :matchId, matchedAt = :matchedAt REMOVE matchingToken, activeUserId',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':matching': 'matching',
            ':matched': 'matched',
            ':matchId': matchId,
            ':matchedAt': matchedAt,
          },
        }),
      );
      if (entry) await this.deleteQueueLookup(entry);
      return true;
    } catch (error) {
      if (isConditionalCheckFailed(error)) return false;
      throw error;
    }
  }

  async cancelByUserId(userId: string) {
    const entry = await this.findActiveByUserId(userId);
    if (!entry) return false;
    try {
      await this.options.client.send(
        updateCommand({
          TableName: this.options.tables.queue,
          Key: { queueEntryId: entry.queueEntryId },
          ConditionExpression: '#status IN (:waiting, :matching)',
          UpdateExpression: 'SET #status = :cancelled REMOVE matchingToken, activeUserId',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':waiting': 'waiting',
            ':matching': 'matching',
            ':cancelled': 'cancelled',
          },
        }),
      );
      await this.deleteQueueLookup(entry);
      return true;
    } catch (error) {
      if (isConditionalCheckFailed(error)) return false;
      throw error;
    }
  }

  private async putWaitingQueueLookup(entry: QueueEntry) {
    const ttl = entry.expiresAt
      ? Math.floor(new Date(entry.expiresAt).getTime() / 1000)
      : ttlEpochSeconds(Date.now(), this.options.ttl.queueTtlSeconds);
    await this.putQueueLookup(entry, ttl);
  }

  private async putQueueLookup(entry: QueueEntry, ttl: number) {
    await this.options.client.send(
      putCommand({
        TableName: this.options.tables.queueLookup,
        Item: {
          statusBucket: queueStatusBucket('waiting', entry.ratingBucket),
          enqueuedAtQueueEntryId: enqueuedAtQueueEntryId(entry.enqueuedAt, entry.queueEntryId),
          queueStatus: 'waiting',
          ratingBucket: entry.ratingBucket,
          queueEntryId: entry.queueEntryId,
          ttl,
        },
      }),
    );
  }

  private async deleteQueueLookup(entry: QueueEntry) {
    await this.options.client.send(
      deleteCommand({
        TableName: this.options.tables.queueLookup,
        Key: {
          statusBucket: queueStatusBucket('waiting', entry.ratingBucket),
          enqueuedAtQueueEntryId: enqueuedAtQueueEntryId(entry.enqueuedAt, entry.queueEntryId),
        },
      }),
    );
  }
}

function isExpired(expiresAt: string | null) {
  return expiresAt != null && new Date(expiresAt).getTime() <= Date.now();
}

export class DynamoMatchRepository implements MatchRepository {
  constructor(private readonly options: DynamoRuntimeRepositoryOptions) {}

  async save(session: MatchSession) {
    await this.options.client.send(
      putCommand({
        TableName: this.options.tables.matches,
        Item: {
          ...session,
          ttl: ttlEpochSeconds(Date.now(), this.options.ttl.matchTtlSeconds),
        },
      }),
    );
  }

  async findById(matchId: string) {
    const result = await this.options.client.send<{ Item?: MatchSession }>(
      getCommand({
        TableName: this.options.tables.matches,
        Key: { matchId },
      }),
    );
    return result.Item ?? null;
  }

  async updateGameIfVersion(matchId: string, expectedVersion: number, nextSession: MatchSession) {
    try {
      await this.options.client.send(
        putCommand({
          TableName: this.options.tables.matches,
          Item: {
            ...nextSession,
            ttl: ttlEpochSeconds(Date.now(), this.options.ttl.matchTtlSeconds),
          },
          ConditionExpression: 'game.version = :expectedVersion AND #status = :started',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':expectedVersion': expectedVersion,
            ':started': 'started',
          },
        }),
      );
      return true;
    } catch (error) {
      if (isConditionalCheckFailed(error)) return false;
      throw error;
    }
  }
}

export class DynamoIntegrationEventRepository implements IntegrationEventRepository {
  constructor(private readonly options: DynamoRuntimeRepositoryOptions) {}

  async save(event: IntegrationEvent) {
    await this.options.client.send(
      putCommand({
        TableName: this.options.tables.outbox,
        Item: {
          ...event,
          deliveryKey: `${event.deliveryStatus}#${event.nextAttemptAt ?? event.createdAt}`,
          ttl: ttlEpochSeconds(Date.now(), this.options.ttl.outboxTtlSeconds),
        },
        ConditionExpression: 'attribute_not_exists(eventId)',
      }),
    );
  }

  async listPending() {
    const result = await this.options.client.send<{ Items?: IntegrationEvent[] }>(
      queryCommand({
        TableName: this.options.tables.outbox,
        IndexName: 'deliveryStatus-index',
        KeyConditionExpression: 'deliveryStatus = :pending',
        ExpressionAttributeValues: { ':pending': 'pending' },
      }),
    );
    const now = Date.now();
    return (result.Items ?? []).filter(
      (event) =>
        !event.nextAttemptAt || new Date(event.nextAttemptAt).getTime() <= now,
    );
  }

  async markDelivered(eventId: string) {
    try {
      await this.options.client.send(
        updateCommand({
          TableName: this.options.tables.outbox,
          Key: { eventId },
          ConditionExpression: 'attribute_exists(eventId)',
          UpdateExpression:
            'SET deliveryStatus = :delivered, deliveryKey = :deliveryKey REMOVE nextAttemptAt',
          ExpressionAttributeValues: {
            ':delivered': 'delivered',
            ':deliveryKey': `delivered#${new Date().toISOString()}`,
          },
        }),
      );
      return true;
    } catch (error) {
      if (isConditionalCheckFailed(error)) return false;
      throw error;
    }
  }

  async markFailed(eventId: string, nextAttemptAt: string | null) {
    try {
      const next = nextAttemptAt ?? new Date().toISOString();
      await this.options.client.send(
        updateCommand({
          TableName: this.options.tables.outbox,
          Key: { eventId },
          ConditionExpression: 'attribute_exists(eventId)',
          UpdateExpression:
            'SET deliveryStatus = :failed, deliveryKey = :deliveryKey, nextAttemptAt = :nextAttemptAt ADD attemptCount :one',
          ExpressionAttributeValues: {
            ':failed': 'pending',
            ':deliveryKey': `pending#${next}`,
            ':nextAttemptAt': nextAttemptAt,
            ':one': 1,
          },
        }),
      );
      return true;
    } catch (error) {
      if (isConditionalCheckFailed(error)) return false;
      throw error;
    }
  }
}

export class DynamoIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly options: DynamoRuntimeRepositoryOptions) {}

  async saveIfAbsent(record: IdempotencyRecord) {
    try {
      await this.options.client.send(
        putCommand({
          TableName: this.options.tables.idempotency,
          Item: record,
          ConditionExpression: 'attribute_not_exists(idempotencyKey)',
        }),
      );
      return true;
    } catch (error) {
      if (isConditionalCheckFailed(error)) return false;
      throw error;
    }
  }

  async findByKey(idempotencyKey: string) {
    const result = await this.options.client.send<{ Item?: IdempotencyRecord }>(
      getCommand({
        TableName: this.options.tables.idempotency,
        Key: { idempotencyKey },
      }),
    );
    return result.Item ?? null;
  }
}

function activeUserId(entry: QueueEntry) {
  return entry.status === 'waiting' || entry.status === 'matching' ? entry.userId : undefined;
}
