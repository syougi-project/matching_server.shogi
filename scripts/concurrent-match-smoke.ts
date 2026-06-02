import type { MatchFoundMessage, WebSocketServerMessage } from '@/types/protocol';

type Client = {
  userId: string;
  rating: number;
  socket: WebSocket;
  events: WebSocketServerMessage[];
  close: () => void;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const port = 42000 + Math.floor(Math.random() * 1000);
  const server = Bun.spawn(['bun', 'run', 'src/dev/server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      BFF_BASE_URL: '',
      MATCHING_TICKET_SECRET: '',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const serverLogs: string[] = [];
  collectOutput(server.stdout, serverLogs);
  collectOutput(server.stderr, serverLogs);
  const clients: Client[] = [];

  try {
    await waitForHealth(port, serverLogs);
    console.log('[concurrent-smoke] server started', { port });

    const users = [
      { userId: 'user-1', rating: 1500 },
      { userId: 'user-2', rating: 1505 },
      { userId: 'user-3', rating: 1510 },
      { userId: 'user-4', rating: 1515 },
      { userId: 'user-5', rating: 1520 },
    ];
    const connected = await Promise.all(
      users.map((user) => connectClient(port, user.userId, user.rating)),
    );
    clients.push(...connected);

    await Promise.all(
      connected.map((client, index) =>
        sendEnterQueue(client, `enter-${index + 1}`),
      ),
    );

    await Promise.all(connected.map((client) => expectMessage(client, 'queue_entered')));
    await delay(300);

    const foundByUser = new Map<string, MatchFoundMessage>();
    for (const client of connected) {
      const found = drainMessages(client, 'match_found');
      if (found.length > 1) {
        throw new Error(`${client.userId} received duplicate match_found messages`);
      }
      if (found[0]) foundByUser.set(client.userId, found[0]);
    }

    const matchedUserIds = Array.from(foundByUser.keys()).sort();
    const waitingUserIds = connected
      .map((client) => client.userId)
      .filter((userId) => !foundByUser.has(userId))
      .sort();
    const matchIds = new Set(Array.from(foundByUser.values()).map((message) => message.matchId));

    if (matchedUserIds.length !== 4) {
      throw new Error(`Expected 4 matched users, got ${matchedUserIds.length}: ${matchedUserIds.join(',')}`);
    }
    if (waitingUserIds.length !== 1) {
      throw new Error(`Expected 1 waiting user, got ${waitingUserIds.length}: ${waitingUserIds.join(',')}`);
    }
    if (matchIds.size !== 2) {
      throw new Error(`Expected 2 unique matches, got ${matchIds.size}`);
    }

    const pairs = describePairs(foundByUser);
    console.log('[concurrent-smoke] concurrent matching succeeded', {
      pairs,
      waitingUserId: waitingUserIds[0],
    });

    const waitingClient = connected.find((client) => client.userId === waitingUserIds[0]);
    if (!waitingClient) throw new Error('Missing waiting client');
    waitingClient.close();
    await delay(150);

    const lateClient = await connectClient(port, 'user-6', 1525);
    clients.push(lateClient);
    await sendEnterQueue(lateClient, 'enter-6');
    await expectMessage(lateClient, 'queue_entered');
    await delay(300);

    const staleMatch = drainMessages(lateClient, 'match_found')[0];
    if (staleMatch) {
      throw new Error(
        `Disconnected waiting user was still matched: ${lateClient.userId} got ${staleMatch.matchId}`,
      );
    }

    console.log('[concurrent-smoke] waiting disconnect cleanup succeeded', {
      disconnectedUserId: waitingClient.userId,
      lateUserId: lateClient.userId,
    });
    console.log('[concurrent-smoke] success');
  } finally {
    for (const client of clients) {
      client.close();
    }
    await delay(50);
    server.kill();
  }
}

async function waitForHealth(port: number, serverLogs: string[]) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://localhost:${port}/health`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await delay(50);
  }
  throw new Error(
    `Timed out waiting for server health on port ${port}\n${serverLogs.join('')}`,
  );
}

async function collectOutput(stream: ReadableStream<Uint8Array>, logs: string[]) {
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      logs.push(Buffer.from(result.value).toString('utf8'));
    }
  } catch {
    // Best-effort diagnostics for child process output.
  }
}

async function connectClient(port: number, userId: string, rating: number): Promise<Client> {
  const url = new URL(`ws://localhost:${port}/ws`);
  url.searchParams.set('userId', userId);
  url.searchParams.set('rating', String(rating));

  const socket = new WebSocket(url.toString());
  const events: WebSocketServerMessage[] = [];
  socket.addEventListener('message', (event) => {
    events.push(JSON.parse(String(event.data)) as WebSocketServerMessage);
  });

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`Connection timeout for ${userId}`)), 5_000);
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timeoutId);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener('error', () => reject(new Error(`Failed to connect ${userId}`)), {
      once: true,
    });
  });

  return {
    userId,
    rating,
    socket,
    events,
    close: () => socket.close(),
  };
}

async function sendEnterQueue(client: Client, requestId: string) {
  client.socket.send(
    JSON.stringify({
      action: 'enter_queue',
      requestId,
      userId: client.userId,
      rating: client.rating,
    }),
  );
}

async function expectMessage<TType extends WebSocketServerMessage['type']>(
  client: Client,
  type: TType,
) {
  const timeoutAt = Date.now() + 10_000;
  while (Date.now() < timeoutAt) {
    const messages = drainMessages(client, type);
    if (messages[0]) return messages[0];
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${type} for ${client.userId}`);
}

function drainMessages<TType extends WebSocketServerMessage['type']>(
  client: Client,
  type: TType,
) {
  const matched: Array<Extract<WebSocketServerMessage, { type: TType }>> = [];
  for (let index = client.events.length - 1; index >= 0; index -= 1) {
    const message = client.events[index];
    if (message?.type === type) {
      client.events.splice(index, 1);
      matched.unshift(message as Extract<WebSocketServerMessage, { type: TType }>);
    }
  }
  return matched;
}

function describePairs(foundByUser: Map<string, MatchFoundMessage>) {
  const byMatchId = new Map<string, string[]>();
  for (const [userId, message] of foundByUser) {
    const users = byMatchId.get(message.matchId) ?? [];
    users.push(userId);
    byMatchId.set(message.matchId, users);
  }

  const pairs = Array.from(byMatchId.entries()).map(([matchId, users]) => ({
    matchId,
    users: users.sort(),
  }));
  for (const pair of pairs) {
    if (pair.users.length !== 2) {
      throw new Error(`Expected exactly 2 users for ${pair.matchId}, got ${pair.users.join(',')}`);
    }
  }
  return pairs;
}

await main();
