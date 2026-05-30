import { DomainError } from '@/lib/errors';
import { verifyMatchmakingTicket } from '@/lib/matchmaking-ticket';
import { nowIso } from '@/lib/time';
import type { ConnectionRepository } from '@/repositories/contracts';
import { MatchingCore } from '@/server/matching-core';
import type { ServerContext } from '@/server/context';
import type { ConnectionRecord } from '@/types/domain';
import type { WebSocketClientMessage, WebSocketServerMessage } from '@/types/protocol';

export type ApiGatewayWebSocketEvent = {
  requestContext: {
    routeKey: string;
    connectionId: string;
  };
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: string | null;
};

export type LambdaResponse = {
  statusCode: number;
  body?: string;
};

export type ApiGatewayManagementClientLike = {
  postToConnection(input: { connectionId: string; data: string }): Promise<void>;
};

export type LambdaHandlerDeps = {
  context: ServerContext;
  connections: ConnectionRepository;
  managementApi: ApiGatewayManagementClientLike;
  ticketSecret: string;
};

export function createWebSocketLambdaHandlers(deps: LambdaHandlerDeps) {
  const core = new MatchingCore(deps.context);

  return {
    connect: (event: ApiGatewayWebSocketEvent) => connect(event, deps),
    disconnect: (event: ApiGatewayWebSocketEvent) => disconnect(event, deps, core),
    message: (event: ApiGatewayWebSocketEvent) => message(event, deps, core),
  };
}

export async function connectHandler(_event: ApiGatewayWebSocketEvent): Promise<LambdaResponse> {
  return { statusCode: 501, body: 'Use createWebSocketLambdaHandlers with DynamoDB repositories.' };
}

export async function disconnectHandler(_event: ApiGatewayWebSocketEvent): Promise<LambdaResponse> {
  return { statusCode: 501, body: 'Use createWebSocketLambdaHandlers with DynamoDB repositories.' };
}

export async function messageHandler(_event: ApiGatewayWebSocketEvent): Promise<LambdaResponse> {
  return { statusCode: 501, body: 'Use createWebSocketLambdaHandlers with DynamoDB repositories.' };
}

export async function matchmakingWorkerHandler(): Promise<LambdaResponse> {
  return { statusCode: 501, body: 'DynamoDB repository wiring is not configured yet.' };
}

export async function reconnectTimeoutWorkerHandler(): Promise<LambdaResponse> {
  return { statusCode: 501, body: 'DynamoDB repository wiring is not configured yet.' };
}

export async function outboxWorkerHandler(): Promise<LambdaResponse> {
  return { statusCode: 501, body: 'DynamoDB repository wiring is not configured yet.' };
}

async function connect(
  event: ApiGatewayWebSocketEvent,
  deps: LambdaHandlerDeps,
): Promise<LambdaResponse> {
  const ticket = event.queryStringParameters?.ticket?.trim();
  if (!ticket) return { statusCode: 401, body: 'Missing ticket' };

  try {
    const claims = verifyMatchmakingTicket(ticket, deps.ticketSecret);
    const now = nowIso();
    await deps.connections.save({
      connectionId: event.requestContext.connectionId,
      userId: claims.userId,
      connectedAt: now,
      lastSeenAt: now,
      status: 'connected',
      currentMatchId: event.queryStringParameters?.matchId?.trim() || null,
      sessionToken: null,
    });
    return { statusCode: 200 };
  } catch (error) {
    return toLambdaError(error);
  }
}

async function disconnect(
  event: ApiGatewayWebSocketEvent,
  deps: LambdaHandlerDeps,
  core: MatchingCore,
): Promise<LambdaResponse> {
  const connection = await deps.connections.findByConnectionId(event.requestContext.connectionId);
  if (!connection) return { statusCode: 200 };

  const closed: ConnectionRecord = {
    ...connection,
    status: 'disconnected',
    lastSeenAt: nowIso(),
  };
  await deps.connections.save(closed);

  if (connection.currentMatchId) {
    const result = await core.disconnect(connection.currentMatchId, connection.userId);
    if (result.opponentMessage) {
      await postToOpponent(deps, result.match, connection.userId, result.opponentMessage);
    }
  }

  return { statusCode: 200 };
}

async function message(
  event: ApiGatewayWebSocketEvent,
  deps: LambdaHandlerDeps,
  core: MatchingCore,
): Promise<LambdaResponse> {
  const connection = await deps.connections.findByConnectionId(event.requestContext.connectionId);
  if (!connection || connection.status !== 'connected') {
    return { statusCode: 401, body: 'Connection is not active' };
  }

  let message: WebSocketClientMessage;
  try {
    message = JSON.parse(event.body ?? '{}') as WebSocketClientMessage;
  } catch {
    await post(deps, connection.connectionId, {
      type: 'error',
      code: 'INVALID_JSON',
      message: 'Message must be valid JSON',
    });
    return { statusCode: 200 };
  }

  const trustedMessage = { ...message, userId: connection.userId } as WebSocketClientMessage;
  const result = await core.handleClientMessage(connection.connectionId, trustedMessage);
  const responseDelivered = await tryPost(deps, connection, result.response);
  if (!responseDelivered) return { statusCode: 200 };

  if (result.match) {
    await deps.connections.save({
      ...connection,
      currentMatchId: result.match.matchId,
      lastSeenAt: nowIso(),
    });
  }

  for (const broadcast of result.broadcasts) {
    const target = await deps.connections.findByUserId(broadcast.userId);
    if (target?.status === 'connected') {
      const delivered = await tryPost(deps, target, broadcast.message);
      if (!delivered) continue;
      if (result.match && target.currentMatchId !== result.match.matchId) {
        await deps.connections.save({ ...target, currentMatchId: result.match.matchId });
      }
    }
  }

  return { statusCode: 200 };
}

async function post(
  deps: LambdaHandlerDeps,
  connectionId: string,
  message: WebSocketServerMessage,
) {
  await deps.managementApi.postToConnection({
    connectionId,
    data: JSON.stringify(message),
  });
}

async function postToOpponent(
  deps: LambdaHandlerDeps,
  match: { playerBlackUserId: string; playerWhiteUserId: string },
  userId: string,
  message: WebSocketServerMessage,
) {
  const opponentUserId =
    match.playerBlackUserId === userId ? match.playerWhiteUserId : match.playerBlackUserId;
  const opponent = await deps.connections.findByUserId(opponentUserId);
  if (opponent?.status === 'connected') {
    await tryPost(deps, opponent, message);
  }
}

async function tryPost(
  deps: LambdaHandlerDeps,
  connection: ConnectionRecord,
  message: WebSocketServerMessage,
) {
  try {
    await post(deps, connection.connectionId, message);
    return true;
  } catch (error) {
    if (!isGoneError(error)) throw error;
    await deps.connections.save({
      ...connection,
      status: 'disconnected',
      lastSeenAt: nowIso(),
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

function toLambdaError(error: unknown): LambdaResponse {
  if (error instanceof DomainError) {
    return { statusCode: error.code === 'TICKET_EXPIRED' ? 401 : 400, body: error.message };
  }
  return {
    statusCode: 500,
    body: error instanceof Error ? error.message : 'Unexpected error',
  };
}
