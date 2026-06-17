import type { MatchSession } from '@/types/domain';

export const ONLINE_PVP_TURN_SECONDS = 30;

export function isBattleClockStarted(match: MatchSession): boolean {
  return match.turnClockStartedAt != null;
}

export function buildBattleClockStartedMessage(match: MatchSession) {
  return {
    type: 'battle_clock_started' as const,
    matchId: match.matchId,
    gameVersion: match.game.version,
    turnSeconds: ONLINE_PVP_TURN_SECONDS,
  };
}
