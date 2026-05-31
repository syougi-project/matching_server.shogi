import { createServerContext } from '@/server/context';
import { buildMatchStartedBroadcasts } from '@/server/matching-core';
import { createWebSocketLambdaHandlers, type ApiGatewayWebSocketEvent } from '@/lambda/handlers';
import type { MatchmakingRequestPublisher } from '@/integrations/matchmaking-request-publisher';
import {
  DynamoConnectionRepository,
  DynamoIntegrationEventRepository,
  DynamoMatchRepository,
  DynamoQueueRepository,
} from '@/repositories/dynamodb/runtime-repositories';
import {
  defaultRuntimeTtlPolicy,
  type DynamoRuntimeTableNames,
} from '@/repositories/dynamodb/schema';
import type { DynamoCommand, DynamoDocumentClientLike } from '@/repositories/dynamodb/client';
import type { ConnectionRecord, MatchSession } from '@/types/domain';
import type { WebSocketServerMessage } from '@/types/protocol';

declare const require: any;

type WorkerEvent = {
  worker?: 'matchmaking' | 'reconnect_timeout' | 'outbox';
};

type SqsEvent = {
  Records: Array<{
    eventSource?: string;
    body?: string;
  }>;
};

type LambdaResponse = {
  statusCode: number;
  body?: string;
};

const AWS = require('aws-sdk');

const dynamoClient = new AWS.DynamoDB.DocumentClient({
  convertEmptyValues: false,
});

const connections = new DynamoConnectionRepository(createRuntimeOptions());
const queue = new DynamoQueueRepository(createRuntimeOptions());
const matches = new DynamoMatchRepository(createRuntimeOptions());
const integrationEvents = new DynamoIntegrationEventRepository(createRuntimeOptions());
const context = createServerContext({
  repositories: {
    connections,
    queue,
    matches,
    integrationEvents,
  },
});

const handlers = createWebSocketLambdaHandlers({
  context,
  connections,
  ticketSecret: requiredEnv('MATCHING_TICKET_SECRET'),
  managementApi: createManagementApi(),
  matchmakingRequests: createMatchmakingRequestPublisher(),
});

export async function handler(
  event: ApiGatewayWebSocketEvent | WorkerEvent | SqsEvent,
): Promise<LambdaResponse> {
  if (isWebSocketEvent(event)) {
    switch (event.requestContext.routeKey) {
      case '$connect':
        return handlers.connect(event);
      case '$disconnect':
        return handlers.disconnect(event);
      default:
        return handlers.message(event);
    }
  }

  if (isSqsEvent(event)) {
    return runMatchmakingBatchWorker(event.Records.length);
  }

  switch (event.worker) {
    case 'matchmaking':
      return runMatchmakingBatchWorker();
    case 'reconnect_timeout':
      return { statusCode: 200, body: 'noop reconnect timeout worker' };
    case 'outbox':
      return { statusCode: 200, body: 'noop outbox worker' };
    default:
      return { statusCode: 400, body: 'Unknown event' };
  }
}

function createRuntimeOptions() {
  return {
    client: createDocumentClient(dynamoClient),
    tables: tableNamesFromEnv(),
    ttl: defaultRuntimeTtlPolicy,
  };
}

function tableNamesFromEnv(): DynamoRuntimeTableNames {
  return {
    connections: requiredEnv('MATCHING_CONNECTIONS_TABLE'),
    queue: requiredEnv('MATCHING_QUEUE_TABLE'),
    queueLookup: requiredEnv('MATCHING_QUEUE_LOOKUP_TABLE'),
    matches: requiredEnv('MATCHING_MATCHES_TABLE'),
    moves: requiredEnv('MATCHING_MOVES_TABLE'),
    idempotency: requiredEnv('MATCHING_IDEMPOTENCY_TABLE'),
    outbox: requiredEnv('MATCHING_OUTBOX_TABLE'),
  };
}

function createDocumentClient(client: any): DynamoDocumentClientLike {
  return {
    async send(command: DynamoCommand) {
      switch (command.kind) {
        case 'GetCommand':
          return await client.get(command.input).promise();
        case 'PutCommand':
          return await client.put(command.input).promise();
        case 'UpdateCommand':
          return await client.update(command.input).promise();
        case 'QueryCommand':
          return await client.query(command.input).promise();
        default:
          throw new Error(`Unsupported Dynamo command: ${command.kind}`);
      }
    },
  };
}

function createManagementApi() {
  const domain = requiredEnv('API_GATEWAY_WEBSOCKET_MANAGEMENT_DOMAIN');
  const stage = requiredEnv('API_GATEWAY_WEBSOCKET_STAGE');
  const endpoint = `https://${domain}/${stage}`;
  const api = new AWS.ApiGatewayManagementApi({ endpoint });

  return {
    async postToConnection(input: { connectionId: string; data: string }) {
      await api
        .postToConnection({
          ConnectionId: input.connectionId,
          Data: input.data,
        })
        .promise();
    },
  };
}

function createMatchmakingRequestPublisher(): MatchmakingRequestPublisher | null {
  const queueUrl = process.env.MATCHING_MATCHMAKING_QUEUE_URL?.trim();
  if (!queueUrl) return null;
  const sqs = new AWS.SQS();
  return {
    async requestMatchmaking(input: { queueEntryId: string; ratingBucket: number }) {
      await sqs
        .sendMessage({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            type: 'matchmaking_requested',
            queueEntryId: input.queueEntryId,
            ratingBucket: input.ratingBucket,
            requestedAt: new Date().toISOString(),
          }),
        })
        .promise();
    },
  };
}

async function runMatchmakingBatchWorker(requestCount = 1): Promise<LambdaResponse> {
  const maxMatches = Math.max(
    context.config.matchmakingBatchSize,
    requestCount > 0 ? Math.ceil(requestCount / 2) : 1,
  );
  const matches = await context.services.matchmaking.runBatch(maxMatches);
  if (matches.length === 0) {
    return { statusCode: 200, body: 'no match' };
  }

  for (const match of matches) {
    for (const broadcast of buildMatchStartedBroadcasts(match)) {
      await postToUser(broadcast.userId, broadcast.message, match);
    }
  }

  return { statusCode: 200, body: matches.map((match) => match.matchId).join(',') };
}

async function postToUser(userId: string, message: WebSocketServerMessage, match: MatchSession) {
  const connection = await connections.findByUserId(userId);
  if (!connection || connection.status !== 'connected') return;

  const delivered = await tryPostToConnection(connection, message);
  if (!delivered) return;

  if (connection.currentMatchId !== match.matchId) {
    await connections.save({
      ...connection,
      currentMatchId: match.matchId,
    });
  }
}

async function tryPostToConnection(
  connection: ConnectionRecord,
  message: WebSocketServerMessage,
) {
  try {
    await createManagementApi().postToConnection({
      connectionId: connection.connectionId,
      data: JSON.stringify(message),
    });
    return true;
  } catch (error) {
    if (!isGoneError(error)) throw error;
    await connections.save({
      ...connection,
      status: 'disconnected',
      lastSeenAt: new Date().toISOString(),
    });
    return false;
  }
}

function isGoneError(error: unknown) {
  const candidate = error as { statusCode?: unknown; code?: unknown; message?: unknown };
  return (
    candidate?.statusCode === 410 ||
    candidate?.code === 'GoneException' ||
    candidate?.message === '410'
  );
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function isWebSocketEvent(
  event: ApiGatewayWebSocketEvent | WorkerEvent | SqsEvent,
): event is ApiGatewayWebSocketEvent {
  return typeof event === 'object' && event != null && 'requestContext' in event;
}

function isSqsEvent(event: ApiGatewayWebSocketEvent | WorkerEvent | SqsEvent): event is SqsEvent {
  return (
    typeof event === 'object' &&
    event != null &&
    'Records' in event &&
    Array.isArray(event.Records) &&
    event.Records.some((record) => record?.eventSource === 'aws:sqs')
  );
}
