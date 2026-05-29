import { fetchJson } from '@/lib/fetch-json';
import type { MatchSession } from '@/types/domain';

export class BffMatchResultClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string | null,
  ) {}

  async recordResult(match: MatchSession): Promise<void> {
    if (!match.finishedAt) return;
    await fetchJson<unknown>(`${this.baseUrl}/api/v1/internal/online-match/result`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...this.internalHeaders(),
      },
      body: JSON.stringify({
        matchId: match.matchId,
        playerBlackUserId: match.playerBlackUserId,
        playerWhiteUserId: match.playerWhiteUserId,
        winnerUserId: match.winnerUserId,
        status: match.status,
        reason: match.endReason ?? 'unknown',
        startedAt: match.startedAt,
        finishedAt: match.finishedAt,
      }),
    });
  }

  private internalHeaders(): Record<string, string> {
    return this.internalToken ? { 'x-matching-internal-token': this.internalToken } : {};
  }
}
