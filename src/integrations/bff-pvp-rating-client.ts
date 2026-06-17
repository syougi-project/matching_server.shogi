import { fetchJson } from '@/lib/fetch-json';
import { shouldApplyPvpRatingForMatch } from '@/lib/online-match-rating-policy';
import type { MatchingServerConfig } from '@/lib/config';
import type { MatchSession } from '@/types/domain';

type ApplyResponse = {
  userId: string;
  rating: number;
  delta: number;
  alreadyApplied: boolean;
};

export class BffPvpRatingClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
  ) {}

  static fromConfig(config: MatchingServerConfig): BffPvpRatingClient | null {
    const baseUrl = config.bffBaseUrl;
    const token = (process.env.MATCHING_BFF_INTERNAL_TOKEN ?? '').trim();
    if (!baseUrl || !token) return null;
    return new BffPvpRatingClient(baseUrl, token);
  }

  async applyMatchFinished(match: MatchSession): Promise<void> {
    if (
      !shouldApplyPvpRatingForMatch({
        status: match.status === 'aborted' ? 'aborted' : 'finished',
        winnerUserId: match.winnerUserId,
        endReason: match.endReason,
      })
    ) {
      return;
    }

    const winnerId = match.winnerUserId!;
    const loserId =
      winnerId === match.playerBlackUserId
        ? match.playerWhiteUserId
        : match.playerBlackUserId;

    await Promise.all([
      this.applyForUser({ userId: winnerId, matchId: match.matchId, won: true }),
      this.applyForUser({ userId: loserId, matchId: match.matchId, won: false }),
    ]);
  }

  private async applyForUser(input: {
    userId: string;
    matchId: string;
    won: boolean;
  }): Promise<void> {
    try {
      await fetchJson<ApplyResponse>(`${this.baseUrl}/api/v1/internal/pvp-rating/apply`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-matching-internal-token': this.internalToken,
        },
        body: JSON.stringify(input),
      });
    } catch (error) {
      console.warn(
        `[matching_server] failed to apply pvp rating for ${input.userId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
