import type { MatchRepository } from '@/repositories/contracts';
import type { MatchSession } from '@/types/domain';

export class InMemoryMatchRepository implements MatchRepository {
  private readonly byId = new Map<string, MatchSession>();

  async save(session: MatchSession) {
    this.byId.set(session.matchId, session);
  }

  async findById(matchId: string) {
    return this.byId.get(matchId) ?? null;
  }

  async listExpiredReconnectMatches(limit = 25) {
    const now = Date.now();
    return [...this.byId.values()]
      .filter(
        (session) =>
          session.status === 'started' &&
          session.reconnectDeadlineAt != null &&
          Date.parse(session.reconnectDeadlineAt) <= now,
      )
      .slice(0, Math.max(1, limit));
  }

  async updateGameIfVersion(matchId: string, expectedVersion: number, nextSession: MatchSession) {
    const current = this.byId.get(matchId);
    if (!current || current.game.version !== expectedVersion) return false;
    this.byId.set(matchId, nextSession);
    return true;
  }
}
