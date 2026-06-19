import type { BattleSetupSnapshot, IntegrationEvent, MatchSession } from '@/types/domain';

export type MatchLifecycleEventType = Extract<
  IntegrationEvent['eventType'],
  'match.started' | 'match.finished' | 'match.aborted'
>;

export interface MatchEventPublisher {
  publishMatchEvent(match: MatchSession, eventType: MatchLifecycleEventType): Promise<void>;
  publishBattleSetupConsume(input: { battleSetupId: string; ownerUserId: string }): Promise<void>;
}

export interface BattleSetupProvider {
  getBattleSetup(battleSetupId: string, ownerUserId: string): Promise<BattleSetupSnapshot>;
}

export interface BattleSetupConsumer {
  consumeBattleSetup(battleSetupId: string, ownerUserId: string): Promise<void>;
}

export interface MatchResultRecorder {
  recordResult(match: MatchSession): Promise<void>;
}

export interface PvpRatingApplier {
  applyMatchFinished(match: MatchSession): Promise<void>;
}
