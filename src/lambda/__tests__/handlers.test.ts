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
