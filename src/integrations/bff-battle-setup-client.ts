import { fetchJson } from '@/lib/fetch-json';
import type { BattleSetupSnapshot } from '@/types/domain';

export class BffBattleSetupClient {
  constructor(private readonly baseUrl: string) {}

  async getBattleSetup(battleSetupId: string, ownerUserId: string): Promise<BattleSetupSnapshot> {
    return fetchJson<BattleSetupSnapshot>(
      `${this.baseUrl}/api/v1/online-match/battle-setup/${encodeURIComponent(battleSetupId)}`,
      {
        headers: {
          Accept: 'application/json',
          'x-internal-user-id': ownerUserId,
        },
      },
    );
  }
}
