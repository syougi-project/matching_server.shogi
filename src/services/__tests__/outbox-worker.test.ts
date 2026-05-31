import { describe, expect, test } from 'bun:test';

import { InMemoryIntegrationEventRepository } from '@/repositories/memory/integration-event-repository';
import { OutboxWorkerService } from '@/services/outbox-worker';
import type { IntegrationEvent, MatchSession } from '@/types/domain';

describe('OutboxWorkerService', () => {
  test('delivers match finished side effects asynchronously', async () => {
    const events = new InMemoryIntegrationEventRepository();
    const recorded: string[] = [];
    const rated: string[] = [];
    await events.save(matchEvent('match.finished'));

    const worker = new OutboxWorkerService(
      events,
      { recordResult: async (match: MatchSession) => recorded.push(match.matchId) } as any,
      { applyMatchFinished: async (match: MatchSession) => rated.push(match.matchId) } as any,
      null,
    );

    const result = await worker.runOnce();

    expect(result).toEqual({ scanned: 1, delivered: 1, failed: 0 });
    expect(recorded).toEqual(['match-1']);
    expect(rated).toEqual(['match-1']);
    expect(await events.listPending()).toHaveLength(0);
  });

  test('delivers battle setup consume asynchronously', async () => {
    const events = new InMemoryIntegrationEventRepository();
    const consumed: string[] = [];
    await events.save({
      ...baseEvent('battle_setup.consume'),
      aggregateType: 'battle_setup',
      aggregateId: 'bsetup-1',
      payload: { battleSetupId: 'bsetup-1', ownerUserId: 'user-1' },
      idempotencyKey: 'bsetup-1:battle_setup.consume',
    });

    const worker = new OutboxWorkerService(
      events,
      null,
      null,
      {
        consumeBattleSetup: async (battleSetupId: string, ownerUserId: string) => {
          consumed.push(`${ownerUserId}:${battleSetupId}`);
        },
      } as any,
    );

    const result = await worker.runOnce();

    expect(result).toEqual({ scanned: 1, delivered: 1, failed: 0 });
    expect(consumed).toEqual(['user-1:bsetup-1']);
  });

  test('keeps failed events pending for delayed retry', async () => {
    const events = new InMemoryIntegrationEventRepository();
    await events.save(matchEvent('match.finished'));
    const worker = new OutboxWorkerService(
      events,
      { recordResult: async () => { throw new Error('bff down'); } } as any,
      null,
      null,
    );

    const result = await worker.runOnce();

    expect(result).toEqual({ scanned: 1, delivered: 0, failed: 1 });
    expect(await events.listPending()).toHaveLength(0);
  });
});

function matchEvent(eventType: 'match.finished' | 'match.aborted'): IntegrationEvent {
  return {
    ...baseEvent(eventType),
    aggregateType: 'match',
    aggregateId: 'match-1',
    payload: {
      matchId: 'match-1',
      playerBlackUserId: 'black',
      playerWhiteUserId: 'white',
      status: eventType === 'match.finished' ? 'finished' : 'aborted',
      winnerUserId: eventType === 'match.finished' ? 'black' : null,
      startedAt: '2026-05-01T00:00:00.000Z',
      finishedAt: '2026-05-01T00:10:00.000Z',
      endReason: eventType === 'match.finished' ? 'king_capture' : 'disconnect_timeout',
    },
    idempotencyKey: `match-1:${eventType}`,
  };
}

function baseEvent(eventType: IntegrationEvent['eventType']): IntegrationEvent {
  return {
    eventId: `evt-${eventType}`,
    aggregateType: 'match',
    aggregateId: 'match-1',
    eventType,
    payload: {},
    deliveryStatus: 'pending',
    attemptCount: 0,
    nextAttemptAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    idempotencyKey: `match-1:${eventType}`,
  };
}
