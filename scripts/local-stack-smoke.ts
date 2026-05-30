import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

import type { WebSocketServerMessage } from '@/types/protocol';

type Client = {
  userId: string;
  socket: WebSocket;
  events: WebSocketServerMessage[];
  close: () => void;
};

type SpawnedService = {
  name: string;
  port: number;
  process: Bun.Subprocess<'ignore', 'pipe', 'pipe'>;
  stdout: string[];
  stderr: string[];
};

type EnvMap = Record<string, string>;

const repoRoot = resolve(import.meta.dir, '..');
const bffRoot = resolve(repoRoot, '..', 'bff.shogi');
const delay = (ms: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function main() {
  const requestedBffPort = Number(process.env.SMOKE_BFF_PORT ?? '0');
  const requestedWsPort = Number(process.env.SMOKE_WS_PORT ?? '0');
  const bffPort = await findAvailablePort(requestedBffPort);
  const wsPort = await findAvailablePort(requestedWsPort);
  const bffEnv = readEnvFile(resolve(bffRoot, '.env'));
  const sharedInternalToken = firstNonEmpty(
    process.env.MATCHING_BFF_INTERNAL_TOKEN,
    bffEnv.MATCHING_BFF_INTERNAL_TOKEN,
  );
  const sharedTicketSecret = firstNonEmpty(
    process.env.MATCHING_TICKET_SECRET,
    bffEnv.MATCHING_TICKET_SECRET,
  );

  const bff = startBffServer(bffPort);
  const matching = startMatchingServer(wsPort, {
    matchingBffBaseUrl: sharedInternalToken ? `http://127.0.0.1:${bffPort}` : null,
    matchingBffInternalToken: sharedInternalToken,
    matchingTicketSecret: sharedTicketSecret,
  });
  const started = [bff, matching];
  const connections: Client[] = [];

  try {
    await waitForHealth(`http://127.0.0.1:${bffPort}/api/health`);
    await waitForHealth(`http://127.0.0.1:${wsPort}/health`);

    console.log('[stack-smoke] services ready', { bffPort, wsPort });

    const bffHealth = await getJson<{ status: string; timestamp: string }>(
      `http://127.0.0.1:${bffPort}/api/health`,
    );
    console.log('[stack-smoke] bff health ok', bffHealth);

    const stages = await getJson<{ stages: Array<{ stageNo: number; stageName: string }> }>(
      `http://127.0.0.1:${bffPort}/api/v1/stages`,
    );
    if (!Array.isArray(stages.stages)) {
      throw new Error('BFF stages endpoint returned an invalid stages payload');
    }
    console.log('[stack-smoke] stages ok', {
      count: stages.stages.length,
      firstStageNo: stages.stages[0]?.stageNo ?? null,
    });

    const pieces = await getJson<{ items: Array<{ pieceId: number; pieceCode: string }> }>(
      `http://127.0.0.1:${bffPort}/api/v1/pieces/catalog`,
    );
    if (!Array.isArray(pieces.items)) {
      throw new Error('BFF piece catalog endpoint returned an invalid items payload');
    }
    console.log('[stack-smoke] pieces ok', {
      count: pieces.items.length,
      firstPieceCode: pieces.items[0]?.pieceCode ?? null,
    });

    const alice = await connectClient(wsPort, 'user-1');
    const bob = await connectClient(wsPort, 'user-2');
    connections.push(alice, bob);

    alice.socket.send(
      JSON.stringify({
        action: 'enter_queue',
        requestId: 'req-1',
        userId: 'user-1',
        rating: 1500,
      }),
    );
    bob.socket.send(
      JSON.stringify({
        action: 'enter_queue',
        requestId: 'req-2',
        userId: 'user-2',
        rating: 1510,
      }),
    );

    await expectMessage(alice, 'queue_entered');
    await expectMessage(bob, 'queue_entered');
    const aliceFound = await expectMessage(alice, 'match_found');
    const bobFound = await expectMessage(bob, 'match_found');
    const aliceStarted = await expectMessage(alice, 'game_started');
    await expectMessage(bob, 'game_started');

    console.log('[stack-smoke] matched', {
      matchId: aliceFound.matchId,
      aliceRole: aliceFound.role,
      bobRole: bobFound.role,
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
    console.log('[stack-smoke] move applied', {
      version: bobUpdate.version,
      turn: bobUpdate.turn,
    });

    bob.close();
    const disconnectNotice = await expectMessage(alice, 'opponent_disconnected');
    console.log('[stack-smoke] disconnect noticed', disconnectNotice.reconnectDeadlineAt);

    const bobReconnected = await connectClient(wsPort, 'user-2', aliceFound.matchId);
    connections.push(bobReconnected);
    const bobResync = await expectMessage(bobReconnected, 'game_state_updated');
    await expectMessage(alice, 'opponent_reconnected');
    console.log('[stack-smoke] reconnect succeeded', {
      reconnectVersion: bobResync.version,
      matchId: aliceFound.matchId,
    });

    bobReconnected.socket.send(
      JSON.stringify({
        action: 'resign',
        requestId: 'req-4',
        userId: 'user-2',
        matchId: aliceFound.matchId,
      }),
    );

    const aliceFinished = await expectMessage(alice, 'game_finished');
    const bobFinished = await expectMessage(bobReconnected, 'game_finished');
    console.log('[stack-smoke] game finished', {
      winner: aliceFinished.winnerUserId,
      reason: aliceFinished.reason,
      bobStatus: bobFinished.status,
    });

    console.log('[stack-smoke] success');
  } finally {
    for (const client of connections) {
      client.close();
    }
    await delay(100);
    for (const service of started.reverse()) {
      stopService(service);
    }
  }
}

function startBffServer(port: number): SpawnedService {
  return startService({
    name: 'bff',
    port,
    cwd: bffRoot,
    cmd: ['npm', 'run', 'dev', '--', '--port', String(port)],
    env: process.env,
  });
}

function startMatchingServer(
  port: number,
  input: {
    matchingBffBaseUrl: string | null;
    matchingBffInternalToken: string | null;
    matchingTicketSecret: string | null;
  },
): SpawnedService {
  return startService({
    name: 'matching',
    port,
    cwd: repoRoot,
    cmd: ['bun', 'run', 'src/dev/server.ts'],
    env: {
      ...process.env,
      PORT: String(port),
      ...(input.matchingBffBaseUrl ? { MATCHING_BFF_BASE_URL: input.matchingBffBaseUrl } : {}),
      ...(input.matchingBffInternalToken
        ? { MATCHING_BFF_INTERNAL_TOKEN: input.matchingBffInternalToken }
        : {}),
      ...(input.matchingTicketSecret ? { MATCHING_TICKET_SECRET: input.matchingTicketSecret } : {}),
    },
  });
}

function startService(input: {
  name: string;
  port: number;
  cwd: string;
  cmd: string[];
  env: NodeJS.ProcessEnv;
}): SpawnedService {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const process = Bun.spawn(input.cmd, {
    cwd: input.cwd,
    env: input.env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  consumeStream(process.stdout, stdout, `[${input.name}:stdout]`);
  consumeStream(process.stderr, stderr, `[${input.name}:stderr]`);
  return {
    name: input.name,
    port: input.port,
    process,
    stdout,
    stderr,
  };
}

function stopService(service: SpawnedService) {
  if (service.process.exitCode != null) return;
  service.process.kill();
}

async function waitForHealth(url: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // retry
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for health: ${url}`);
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${url}, got: ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 200)}`);
  }
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('ok' in payload) ||
    (payload as { ok?: unknown }).ok !== true ||
    !('data' in payload)
  ) {
    throw new Error(`Invalid API envelope from ${url}`);
  }
  return (payload as { data: T }).data;
}

async function connectClient(port: number, userId: string, matchId?: string): Promise<Client> {
  const url = new URL(`ws://127.0.0.1:${port}/ws`);
  url.searchParams.set('userId', userId);
  if (matchId) {
    url.searchParams.set('matchId', matchId);
  }

  console.log('[stack-smoke] connecting', { userId, url: url.toString() });
  const socket = new WebSocket(url.toString());
  const events: WebSocketServerMessage[] = [];
  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(String(event.data)) as WebSocketServerMessage;
    events.push(payload);
  });

  await new Promise<void>((resolveConnection, rejectConnection) => {
    const timeoutId = setTimeout(
      () => rejectConnection(new Error(`Connection timeout for ${userId}`)),
      5_000,
    );
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timeoutId);
        console.log('[stack-smoke] connected', { userId });
        resolveConnection();
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => rejectConnection(new Error(`Failed to connect ${userId}`)),
      { once: true },
    );
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

function consumeStream(
  stream: ReadableStream<Uint8Array> | null,
  chunks: string[],
  prefix: string,
) {
  if (!stream) return;
  void (async () => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      chunks.push(text);
      const trimmed = text.trim();
      if (trimmed) {
        console.log(prefix, trimmed);
      }
    }
  })();
}

function readEnvFile(path: string): EnvMap {
  if (!existsSync(path)) return {};
  const env: EnvMap = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator < 0) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    env[key] = unquote(value);
  }
  return env;
}

function unquote(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function firstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

async function findAvailablePort(preferredPort: number) {
  if (preferredPort > 0 && (await canListen(preferredPort))) {
    return preferredPort;
  }

  return await new Promise<number>((resolvePort, rejectPort) => {
    const server = createServer();
    server.unref();
    server.once('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((closeError) => {
        if (closeError) {
          rejectPort(closeError);
          return;
        }
        if (!port) {
          rejectPort(new Error('Failed to allocate a free port'));
          return;
        }
        resolvePort(port);
      });
    });
  });
}

async function canListen(port: number) {
  return await new Promise<boolean>((resolveCanListen) => {
    const server = createServer();
    server.unref();
    server.once('error', () => resolveCanListen(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolveCanListen(true));
    });
  });
}

await main();
