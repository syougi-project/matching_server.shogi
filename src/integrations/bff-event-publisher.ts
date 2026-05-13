import { createId } from '@/lib/id';
import { nowIso } from '@/lib/time';
import type { IntegrationEventRepository } from '@/repositories/contracts';
import type { IntegrationEventType, MatchSession } from '@/types/domain';

export class BffEventPublisher {
  constructor(private readonly events: IntegrationEventRepository) {}

  async publishMatchEvent(match: MatchSession, eventType: IntegrationEventType) {
    const eventId = createId('evt');
    await this.events.save({
      eventId,
      aggregateType: 'match',
      aggregateId: match.matchId,
      eventType,
      payload: {
        matchId: match.matchId,
        playerBlackUserId: match.playerBlackUserId,
        playerWhiteUserId: match.playerWhiteUserId,
        status: match.status,
        winnerUserId: match.winnerUserId,
        startedAt: match.startedAt,
        finishedAt: match.finishedAt,
        endReason: match.endReason,
      },
      deliveryStatus: 'pending',
      attemptCount: 0,
      nextAttemptAt: null,
      createdAt: nowIso(),
      idempotencyKey: `${match.matchId}:${eventType}`,
    });
  }
}
