import { describe, expect, test } from 'bun:test';

import { BffPvpRatingClient } from '@/integrations/bff-pvp-rating-client';
import type { MatchSession } from '@/types/domain';

describe('BffPvpRatingClient', () => {
  test('applies rating for disconnect finishes', async () => {
    const calls: string[] = [];
    const client = new BffPvpRatingClient('http://bff.test', 'token');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls.push('fetch');
      return new Response(JSON.stringify({ ok: true, data: { rating: 1500, delta: 16 } }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    try {
      await client.applyMatchFinished(baseMatch({ endReason: 'disconnect' }));
      expect(calls.length).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('applies rating for king capture finishes', async () => {
    const calls: string[] = [];
    const client = new BffPvpRatingClient('http://bff.test', 'token');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      calls.push('fetch');
      return new Response(JSON.stringify({ ok: true, data: { rating: 1500, delta: 16 } }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    try {
      await client.applyMatchFinished(baseMatch({ endReason: 'king_capture' }));
      expect(calls.length).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function baseMatch(overrides: Partial<MatchSession>): MatchSession {
  return {
    matchId: 'match-1',
    status: 'finished',
    playerBlackUserId: 'black',
    playerWhiteUserId: 'white',
    playerBlackProfile: { userId: 'black', displayName: 'Black', rating: 1500 },
    playerWhiteProfile: { userId: 'white', displayName: 'White', rating: 1500 },
    playerBlackConnectionId: 'c1',
    playerWhiteConnectionId: 'c2',
    startedAt: '2026-05-01T00:00:00.000Z',
    finishedAt: '2026-05-01T00:10:00.000Z',
    winnerUserId: 'black',
    endReason: 'king_capture',
    disconnectedAtBlack: null,
    disconnectedAtWhite: null,
    reconnectDeadlineAt: null,
    battleReadyBlack: false,
    battleReadyWhite: false,
    turnClockStartedAt: null,
    ruleSnapshot: { version: 1, createdAt: '2026-05-01T00:00:00.000Z', piecesByCode: {}, skillDefinitions: [] },
    game: {
      version: 1,
      turn: 'black',
      moveCount: 1,
      boardState: {},
      handsState: { black: {}, white: {} },
    },
    ...overrides,
  };
}
