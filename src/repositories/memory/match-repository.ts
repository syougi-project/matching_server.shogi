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

  async updateGameIfVersion(matchId: string, expectedVersion: number, nextSession: MatchSession) {
    const current = this.byId.get(matchId);
    if (!current || current.game.version !== expectedVersion) return false;
    this.byId.set(matchId, nextSession);
    return true;
  }
}
