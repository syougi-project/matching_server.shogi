import { describe, expect, test } from 'bun:test';
import type { DynamoCommand, DynamoDocumentClientLike } from '@/repositories/dynamodb/client';
import {
  DynamoMatchRepository,
  DynamoQueueRepository,
} from '@/repositories/dynamodb/runtime-repositories';
import { defaultRuntimeTtlPolicy, type DynamoRuntimeTableNames } from '@/repositories/dynamodb/schema';
import type { MatchSession, QueueEntry } from '@/types/domain';

const tables: DynamoRuntimeTableNames = {
  connections: 'connections',
  queue: 'queue',
  queueLookup: 'queueLookup',
  matches: 'matches',
  moves: 'moves',
  idempotency: 'idempotency',
  outbox: 'outbox',
};

class FakeDynamoClient implements DynamoDocumentClientLike {
  commands: DynamoCommand[] = [];
  items = new Map<string, unknown>();

  async send<T>(command: DynamoCommand): Promise<T> {
    this.commands.push(command);
    if (command.kind === 'GetCommand') {
      const key = command.input.Key as { queueEntryId?: string; matchId?: string } | undefined;
      const id = key?.queueEntryId ?? key?.matchId;
      return { Item: id ? this.items.get(id) : undefined } as T;
    }
    return {} as T;
  }
}

describe('DynamoQueueRepository', () => {
  test('reserves a waiting entry with a conditional update', async () => {
    const client = new FakeDynamoClient();
    const repository = new DynamoQueueRepository({ client, tables, ttl: defaultRuntimeTtlPolicy });

    const reserved = await repository.reserveWaitingEntry('queue-1', 'token-1');

    expect(reserved).toBe(true);
    expect(client.commands[1]).toMatchObject({
      kind: 'UpdateCommand',
      input: {
        TableName: 'queue',
        Key: { queueEntryId: 'queue-1' },
        ConditionExpression: '#status = :waiting',
      },
    });
  });

  test('deletes the waiting lookup row when reserving an entry', async () => {
    const client = new FakeDynamoClient();
    client.items.set('queue-1', {
      queueEntryId: 'queue-1',
      userId: 'user-1',
      displayName: 'Alice',
      rating: 1520,
      ratingBucket: 1500,
      status: 'waiting',
      enqueuedAt: '2026-01-01T00:00:00.000Z',
      matchingToken: null,
      connectionId: 'conn-1',
      region: null,
      matchedAt: null,
      matchId: null,
      expiresAt: '2026-01-01T00:02:00.000Z',
      battleSetupId: 'bsetup-1',
    } satisfies QueueEntry);
    const repository = new DynamoQueueRepository({ client, tables, ttl: defaultRuntimeTtlPolicy });

    await repository.reserveWaitingEntry('queue-1', 'token-1');

    expect(client.commands[2]).toMatchObject({
      kind: 'DeleteCommand',
      input: {
        TableName: 'queueLookup',
        Key: {
          statusBucket: 'waiting#1500',
          enqueuedAtQueueEntryId: '2026-01-01T00:00:00.000Z#queue-1',
        },
      },
    });
  });

  test('writes a lookup row for waiting queue entries', async () => {
    const client = new FakeDynamoClient();
    const repository = new DynamoQueueRepository({ client, tables, ttl: defaultRuntimeTtlPolicy });
    const entry: QueueEntry = {
      queueEntryId: 'queue-1',
      userId: 'user-1',
      displayName: 'Alice',
      rating: 1520,
      ratingBucket: 1500,
      status: 'waiting',
      enqueuedAt: '2026-01-01T00:00:00.000Z',
      matchingToken: null,
      connectionId: 'conn-1',
      region: null,
      matchedAt: null,
      matchId: null,
      expiresAt: '2026-01-01T00:02:00.000Z',
      battleSetupId: 'bsetup-1',
    };

    await repository.save(entry);

    expect(client.commands).toHaveLength(2);
    expect(client.commands[1]).toMatchObject({
      kind: 'PutCommand',
      input: {
        TableName: 'queueLookup',
        Item: {
          statusBucket: 'waiting#1500',
          queueStatus: 'waiting',
          ratingBucket: 1500,
          queueEntryId: 'queue-1',
        },
      },
    });
  });
});

describe('DynamoMatchRepository', () => {
  test('updates match state only when version and status match', async () => {
    const client = new FakeDynamoClient();
    const repository = new DynamoMatchRepository({ client, tables, ttl: defaultRuntimeTtlPolicy });
    const session: MatchSession = {
      matchId: 'match-1',
      status: 'started',
      playerBlackUserId: 'user-1',
      playerWhiteUserId: 'user-2',
      playerBlackProfile: { userId: 'user-1', displayName: 'Alice', rating: 1500 },
      playerWhiteProfile: { userId: 'user-2', displayName: 'Bob', rating: 1500 },
      playerBlackConnectionId: 'conn-1',
      playerWhiteConnectionId: 'conn-2',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
      winnerUserId: null,
      endReason: null,
      disconnectedAtBlack: null,
      disconnectedAtWhite: null,
      reconnectDeadlineAt: null,
      ruleSnapshot: { version: 1, createdAt: '2026-01-01T00:00:00.000Z', piecesByCode: {}, skillDefinitions: [] },
      game: {
        boardState: {},
        handsState: { black: {}, white: {} },
        turn: 'black',
        moveCount: 0,
        version: 1,
      },
    };

    const updated = await repository.updateGameIfVersion('match-1', 1, session);

    expect(updated).toBe(true);
    expect(client.commands[0]).toMatchObject({
      kind: 'PutCommand',
      input: {
        TableName: 'matches',
        ConditionExpression: 'game.version = :expectedVersion AND #status = :started',
        ExpressionAttributeValues: {
          ':expectedVersion': 1,
          ':started': 'started',
        },
      },
    });
  });
});
