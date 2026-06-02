import { createHmac } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import { createServerContext } from '@/server/context';
import { createWebSocketLambdaHandlers, type ApiGatewayWebSocketEvent } from '@/lambda/handlers';
import { InMemoryConnectionRepository } from '@/repositories/memory/connection-repository';

const secret = 'test-secret';

describe('websocket lambda handlers', () => {
  test('connect verifies ticket and stores the connection', async () => {
    const connections = new InMemoryConnectionRepository();
    const context = createServerContext({ repositories: { connections } });
    const handlers = createWebSocketLambdaHandlers({
      context,
      connections,
      ticketSecret: secret,
      managementApi: { postToConnection: async () => undefined },
    });

    const response = await handlers.connect(event('conn-1', '$connect', null, {
      ticket: ticket({ userId: 'user-1', displayName: 'Alice', rating: 1500 }),
    }));
    const stored = await connections.findByConnectionId('conn-1');

    expect(response.statusCode).toBe(200);
    expect(stored?.userId).toBe('user-1');
    expect(stored?.status).toBe('connected');
  });

  test('connect rejects missing tickets', async () => {
    const connections = new InMemoryConnectionRepository();
    const context = createServerContext({ repositories: { connections } });
    const handlers = createWebSocketLambdaHandlers({
      context,
      connections,
      ticketSecret: secret,
      managementApi: { postToConnection: async () => undefined },
    });

    const response = await handlers.connect(event('conn-1', '$connect'));

    expect(response.statusCode).toBe(401);
  });

  test('disconnect finishes active match and notifies the opponent', async () => {
    const connections = new InMemoryConnectionRepository();
    const context = createServerContext({ repositories: { connections } });
    const posted: Array<{ connectionId: string; message: any }> = [];
    const handlers = createWebSocketLambdaHandlers({
      context,
      connections,
      ticketSecret: secret,
      managementApi: {
        async postToConnection(input) {
          posted.push({
            connectionId: input.connectionId,
            message: JSON.parse(input.data),
          });
        },
      },
    });

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });
    await context.services.queue.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1500,
    });
    const match = await context.services.matchmaking.runOnce();
    expect(match).not.toBeNull();

    await connections.save({
      connectionId: 'conn-1',
      userId: match!.playerBlackUserId,
      connectedAt: '2026-05-10T00:00:00.000Z',
      lastSeenAt: '2026-05-10T00:00:00.000Z',
      status: 'connected',
      currentMatchId: match!.matchId,
      sessionToken: null,
    });
    await connections.save({
      connectionId: 'conn-2',
      userId: match!.playerWhiteUserId,
      connectedAt: '2026-05-10T00:00:00.000Z',
      lastSeenAt: '2026-05-10T00:00:00.000Z',
      status: 'connected',
      currentMatchId: match!.matchId,
      sessionToken: null,
    });

    const response = await handlers.disconnect(event('conn-1', '$disconnect'));
    const stored = await context.repositories.matches.findById(match!.matchId);

    expect(response.statusCode).toBe(200);
    expect(stored?.status).toBe('finished');
    expect(stored?.winnerUserId).toBe(match!.playerWhiteUserId);
    expect(posted).toContainEqual({
      connectionId: 'conn-2',
      message: {
        type: 'game_finished',
        matchId: match!.matchId,
        status: 'finished',
        winnerUserId: match!.playerWhiteUserId,
        reason: 'disconnect',
      },
    });
  });

  test('disconnect cancels a waiting queue entry', async () => {
    const connections = new InMemoryConnectionRepository();
    const context = createServerContext({ repositories: { connections } });
    const handlers = createWebSocketLambdaHandlers({
      context,
      connections,
      ticketSecret: secret,
      managementApi: { postToConnection: async () => undefined },
    });

    const entry = await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });
    await connections.save({
      connectionId: 'conn-1',
      userId: 'user-1',
      connectedAt: '2026-05-10T00:00:00.000Z',
      lastSeenAt: '2026-05-10T00:00:00.000Z',
      status: 'connected',
      currentMatchId: null,
      sessionToken: null,
    });

    const response = await handlers.disconnect(event('conn-1', '$disconnect'));
    const queued = await context.repositories.queue.findById(entry.queueEntryId);
    const active = await context.repositories.queue.findActiveByUserId('user-1');

    expect(response.statusCode).toBe(200);
    expect(queued?.status).toBe('cancelled');
    expect(active).toBeNull();
  });
});

function event(
  connectionId: string,
  routeKey: string,
  body: unknown = null,
  queryStringParameters: Record<string, string> | null = null,
): ApiGatewayWebSocketEvent {
  return {
    requestContext: { connectionId, routeKey },
    queryStringParameters,
    body: body == null ? null : JSON.stringify(body),
  };
}

function ticket(input: { userId: string; displayName: string; rating: number }) {
  const payload = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + 60,
  };
  const payloadPart = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signaturePart = createHmac('sha256', secret).update(payloadPart).digest('base64url');
  return `${payloadPart}.${signaturePart}`;
}
