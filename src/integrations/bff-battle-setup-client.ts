import { fetchJson } from '@/lib/fetch-json';
import type { BattleSetupSnapshot } from '@/types/domain';

export class BffBattleSetupClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string | null,
  ) {}

  async getBattleSetup(battleSetupId: string, ownerUserId: string): Promise<BattleSetupSnapshot> {
    return fetchJson<BattleSetupSnapshot>(
      `${this.baseUrl}/api/v1/online-match/battle-setup/${encodeURIComponent(battleSetupId)}`,
      {
        headers: {
          Accept: 'application/json',
          'x-internal-user-id': ownerUserId,
          ...this.internalHeaders(),
        },
      },
    );
  }

  async consumeBattleSetup(battleSetupId: string, ownerUserId: string): Promise<void> {
    await fetchJson<{ battleSetupId: string; status: 'consumed' }>(
      `${this.baseUrl}/api/v1/online-match/battle-setup/${encodeURIComponent(battleSetupId)}/consume`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'x-internal-user-id': ownerUserId,
          ...this.internalHeaders(),
        },
      },
    );
  }

  private internalHeaders(): Record<string, string> {
    return this.internalToken ? { 'x-matching-internal-token': this.internalToken } : {};
  }
}
