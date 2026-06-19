import type { IntegrationEventRepository } from '@/repositories/contracts';
import type {
  BattleSetupConsumer,
  MatchResultRecorder,
  PvpRatingApplier,
} from '@/services/ports';
import type { IntegrationEvent, MatchSession } from '@/types/domain';

export type IntegrationEventHandler = (event: IntegrationEvent) => Promise<void>;

export class OutboxWorkerService {
  constructor(
    private readonly events: IntegrationEventRepository,
    private readonly handlers: Partial<Record<IntegrationEvent['eventType'], IntegrationEventHandler>>,
  ) {}

  async runOnce(limit = 25) {
    const events = (await this.events.listPending()).slice(0, Math.max(1, limit));
    let delivered = 0;
    let failed = 0;

    for (const event of events) {
      try {
        await this.deliver(event);
        await this.events.markDelivered(event.eventId);
        delivered += 1;
      } catch (error) {
        failed += 1;
        await this.events.markFailed(event.eventId, nextAttemptAt(event.attemptCount));
        console.warn(
          `[matching_server] outbox delivery failed eventId=${event.eventId} type=${event.eventType}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    return { scanned: events.length, delivered, failed };
  }

  private async deliver(event: IntegrationEvent) {
    await this.handlers[event.eventType]?.(event);
  }
}

export function createOutboxEventHandlers(input: {
  matchResultRecorder?: MatchResultRecorder | null;
  pvpRatingApplier?: PvpRatingApplier | null;
  battleSetupConsumer?: BattleSetupConsumer | null;
}): Partial<Record<IntegrationEvent['eventType'], IntegrationEventHandler>> {
  return {
    'match.started': async () => {},
    'match.finished': async (event) => {
      const match = matchFromPayload(event);
      await input.matchResultRecorder?.recordResult(match);
      await input.pvpRatingApplier?.applyMatchFinished(match);
    },
    'match.aborted': async (event) => {
      await input.matchResultRecorder?.recordResult(matchFromPayload(event));
    },
    'battle_setup.consume': async (event) => {
      if (!input.battleSetupConsumer) return;
      const battleSetupId = stringPayload(event, 'battleSetupId');
      const ownerUserId = stringPayload(event, 'ownerUserId');
      await input.battleSetupConsumer.consumeBattleSetup(battleSetupId, ownerUserId);
    },
  };
}

function stringPayload(event: IntegrationEvent, key: string) {
  const value = event.payload[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Outbox event ${event.eventId} missing payload.${key}`);
  }
  return value;
}

function matchFromPayload(event: IntegrationEvent): MatchSession {
  return {
    matchId: stringPayload(event, 'matchId'),
    status: String(event.payload.status ?? 'finished') as MatchSession['status'],
    playerBlackUserId: stringPayload(event, 'playerBlackUserId'),
    playerWhiteUserId: stringPayload(event, 'playerWhiteUserId'),
    playerBlackProfile: { userId: '', displayName: '', rating: 0 },
    playerWhiteProfile: { userId: '', displayName: '', rating: 0 },
    playerBlackConnectionId: '',
    playerWhiteConnectionId: '',
    startedAt: String(event.payload.startedAt ?? event.createdAt),
    finishedAt: String(event.payload.finishedAt ?? event.createdAt),
    winnerUserId:
      typeof event.payload.winnerUserId === 'string' ? event.payload.winnerUserId : null,
    endReason: typeof event.payload.endReason === 'string' ? event.payload.endReason : null,
    disconnectedAtBlack: null,
    disconnectedAtWhite: null,
    reconnectDeadlineAt: null,
    battleReadyBlack: false,
    battleReadyWhite: false,
    turnClockStartedAt: null,
    ruleSnapshot: { version: 0, createdAt: event.createdAt, piecesByCode: {}, skillDefinitions: [] },
    game: {
      version: 0,
      turn: 'black',
      moveCount: 0,
      boardState: {},
      handsState: { black: {}, white: {} },
    },
  };
}

function nextAttemptAt(attemptCount: number) {
  const delaySeconds = Math.min(300, 5 * 2 ** Math.max(0, attemptCount));
  return new Date(Date.now() + delaySeconds * 1000).toISOString();
}
