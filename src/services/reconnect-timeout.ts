import type { MatchRepository } from '@/repositories/contracts';
import type { GameCommandService } from '@/services/game-command';
import type { MatchSession } from '@/types/domain';

export class ReconnectTimeoutService {
  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly gameCommand: GameCommandService,
  ) {}

  async processExpired(limit = 25): Promise<MatchSession[]> {
    const candidates = await this.matchRepository.listExpiredReconnectMatches(limit);
    const finished: MatchSession[] = [];

    for (const candidate of candidates) {
      const match = await this.gameCommand.abortExpiredReconnect(candidate.matchId);
      if (match?.status === 'finished') {
        finished.push(match);
      }
    }

    return finished;
  }
}
