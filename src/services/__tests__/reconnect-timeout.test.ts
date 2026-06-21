import { describe, expect, test } from 'bun:test';

import { InMemoryMatchRepository } from '@/repositories/memory/match-repository';
import { GameCommandService } from '@/services/game-command';
import { ReconnectTimeoutService } from '@/services/reconnect-timeout';
import { InMemoryIntegrationEventRepository } from '@/repositories/memory/integration-event-repository';
import { BffEventPublisher } from '@/integrations/bff-event-publisher';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { loadConfig } from '@/lib/config';
import type { MatchSession } from '@/types/domain';

describe('ReconnectTimeoutService', () => {
  test('finishes expired reconnect matches as disconnect forfeit', async () => {
    const matches = new InMemoryMatchRepository();
    const events = new InMemoryIntegrationEventRepository();
    const gameCommand = new GameCommandService(
      matches,
      new BffEventPublisher(events),
      new BasicRuleEngine(),
      loadConfig(),
    );
    const service = new ReconnectTimeoutService(matches, gameCommand);

    await matches.save(
      baseMatch({
        disconnectedAtWhite: '2000-01-01T00:00:00.000Z',
        reconnectDeadlineAt: '2000-01-01T00:00:00.000Z',
      }),
    );

    const finished = await service.processExpired();

    expect(finished).toHaveLength(1);
    expect(finished[0]?.status).toBe('finished');
    expect(finished[0]?.endReason).toBe('disconnect');
    expect(finished[0]?.winnerUserId).toBe('black-user');
  });
});

function baseMatch(overrides: Partial<MatchSession>): MatchSession {
  return {
    matchId: 'match-1',
    status: 'started',
    playerBlackUserId: 'black-user',
    playerWhiteUserId: 'white-user',
    playerBlackProfile: { userId: 'black-user', displayName: 'Black', rating: 1500 },
    playerWhiteProfile: { userId: 'white-user', displayName: 'White', rating: 1500 },
    playerBlackConnectionId: 'conn-black',
    playerWhiteConnectionId: 'conn-white',
    startedAt: '2026-05-01T00:00:00.000Z',
    finishedAt: null as unknown as string,
    winnerUserId: null,
    endReason: null,
    disconnectedAtBlack: null,
    disconnectedAtWhite: null,
    reconnectDeadlineAt: null,
    battleReadyBlack: true,
    battleReadyWhite: true,
    turnClockStartedAt: '2026-05-01T00:00:01.000Z',
    ruleSnapshot: {
      version: 1,
      createdAt: '2026-05-01T00:00:00.000Z',
      piecesByCode: {},
      skillDefinitions: [],
    },
    game: {
      version: 1,
      turn: 'black',
      moveCount: 0,
      boardState: {},
      handsState: { black: {}, white: {} },
    },
    ...overrides,
  };
}
