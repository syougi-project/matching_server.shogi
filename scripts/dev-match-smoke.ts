import type { WebSocketServerMessage } from '@/types/protocol';

type Client = {
  userId: string;
  socket: WebSocket;
  events: WebSocketServerMessage[];
  close: () => void;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const port = 3200 + Math.floor(Math.random() * 200);
  const server = Bun.spawn(['bun', 'run', 'src/dev/server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const connections: Client[] = [];

  try {
    await waitForHealth(port);
    console.log('[smoke] server started', { port });
    const alice = await connectClient(port, 'user-1');
    const bob = await connectClient(port, 'user-2');
    connections.push(alice, bob);

    alice.socket.send(
      JSON.stringify({
        action: 'enter_queue',
        requestId: 'req-1',
        userId: 'user-1',
        rating: 1500,
        battleSetupId: 'bsetup_alice',
      }),
    );
    bob.socket.send(
      JSON.stringify({
        action: 'enter_queue',
        requestId: 'req-2',
        userId: 'user-2',
        rating: 1510,
        battleSetupId: 'bsetup_bob',
      }),
    );

    await expectMessage(alice, 'queue_entered');
    await expectMessage(bob, 'queue_entered');
    const aliceFound = await expectMessage(alice, 'match_found');
    const bobFound = await expectMessage(bob, 'match_found');
    const aliceStarted = await expectMessage(alice, 'game_started');
    const bobStarted = await expectMessage(bob, 'game_started');

    console.log('[smoke] matched', {
      aliceRole: aliceFound.role,
      bobRole: bobFound.role,
      matchId: aliceFound.matchId,
    });

    alice.socket.send(
      JSON.stringify({
        action: 'make_move',
        requestId: 'req-3',
        userId: 'user-1',
        matchId: aliceFound.matchId,
        expectedVersion: aliceStarted.initialState.version,
        move: { from: '7g', to: '7f', piece: 'FU' },
      }),
    );

    await expectMessage(alice, 'game_state_updated');
    const bobUpdate = await expectMessage(bob, 'game_state_updated');
    console.log('[smoke] move applied', {
      version: bobUpdate.version,
      turn: bobUpdate.turn,
    });

    bob.close();
    const disconnectNotice = await expectMessage(alice, 'opponent_disconnected');
    console.log('[smoke] disconnect noticed', disconnectNotice.reconnectDeadlineAt);

    const bobReconnected = await connectClient(port, 'user-2', aliceFound.matchId);
    connections.push(bobReconnected);
    const bobResync = await expectMessage(bobReconnected, 'game_state_updated');
    const aliceReconnectNotice = await expectMessage(alice, 'opponent_reconnected');
    console.log('[smoke] reconnect succeeded', {
      reconnectVersion: bobResync.version,
      matchId: aliceReconnectNotice.matchId,
    });

    bobReconnected.socket.send(
      JSON.stringify({
        action: 'resign',
        requestId: 'req-4',
        userId: 'user-2',
        matchId: aliceFound.matchId,
      }),
    );

    const bobFinished = await expectMessage(bobReconnected, 'game_finished');
    const aliceFinished = await expectMessage(alice, 'game_finished');
    console.log('[smoke] game finished', {
      winner: aliceFinished.winnerUserId,
      reason: aliceFinished.reason,
      bobStatus: bobFinished.status,
    });

    console.log('[smoke] success');
  } finally {
    for (const client of connections) {
      client.close();
    }
    await delay(50);
    server.kill();
  }
}

async function waitForHealth(port: number) {
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
  throw new Error(`Timed out waiting for server health on port ${port}`);
}

async function connectClient(port: number, userId: string, matchId?: string): Promise<Client> {
  const url = new URL(`ws://localhost:${port}/ws`);
  url.searchParams.set('userId', userId);
  if (matchId) {
    url.searchParams.set('matchId', matchId);
  }

  console.log('[smoke] connecting', { userId, url: url.toString() });
  const socket = new WebSocket(url.toString());
  const events: WebSocketServerMessage[] = [];
  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(String(event.data)) as WebSocketServerMessage;
    events.push(payload);
  });

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`Connection timeout for ${userId}`)), 5_000);
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timeoutId);
        console.log('[smoke] connected', { userId });
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
    socket,
    events,
    close: () => socket.close(),
  };
}

async function expectMessage<TType extends WebSocketServerMessage['type']>(
  client: Client,
  type: TType,
) {
  const timeoutAt = Date.now() + 10_000;
  while (Date.now() < timeoutAt) {
    const index = client.events.findIndex((message) => message.type === type);
    if (index >= 0) {
      const [message] = client.events.splice(index, 1);
      if (message) {
        return message as Extract<WebSocketServerMessage, { type: TType }>;
      }
    }
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${type} for ${client.userId}`);
}

await main();
