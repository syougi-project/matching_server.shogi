import { describe, expect, test } from 'bun:test';

import { InMemoryPieceCatalogProvider } from '@/catalog/default-piece-catalog';
import { RuleSnapshotBuilder } from '@/catalog/rule-snapshot';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { BffEventPublisher } from '@/integrations/bff-event-publisher';
import { InMemoryIntegrationEventRepository } from '@/repositories/memory/integration-event-repository';
import { InMemoryMatchRepository } from '@/repositories/memory/match-repository';
import { InMemoryQueueRepository } from '@/repositories/memory/queue-repository';
import { MatchmakingService } from '@/services/matchmaking';
import { QueueService } from '@/services/queue';
import type { BattleSetupSnapshot } from '@/types/domain';

const config = {
  ratingBucketSize: 100,
  reconnectGraceSeconds: 30,
  queueTtlSeconds: 120,
  matchmakingBatchSize: 20,
  matchmakingBucketScanLimit: 50,
  matchmakingBucketCandidateLimit: 25,
  bffBaseUrl: null,
} as const;

describe('MatchmakingService battle setup integration', () => {
  test('creates a match from locked battle setups when client is available', async () => {
    const queueRepository = new InMemoryQueueRepository();
    const matchRepository = new InMemoryMatchRepository();
    const eventRepository = new InMemoryIntegrationEventRepository();
    const queueService = new QueueService(queueRepository, config);
    const battleSetups = new Map<string, BattleSetupSnapshot>([
      [
        'bsetup_black',
        {
          battleSetupId: 'bsetup_black',
          ownerUserId: 'user-1',
          status: 'locked',
          name: 'black',
          boardLayout: [{ row: 8, col: 4, pieceId: 1, pieceCode: 'OU' }],
          handsLayout: [{ pieceId: 10, pieceCode: 'FU', count: 2 }],
          selectedPieceIds: [1, 10],
          validationSummary: { boardPieceCount: 1, handPieceCount: 2, totalSelectedPieces: 2 },
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
      ],
      [
        'bsetup_white',
        {
          battleSetupId: 'bsetup_white',
          ownerUserId: 'user-2',
          status: 'locked',
          name: 'white',
          boardLayout: [{ row: 8, col: 4, pieceId: 2, pieceCode: 'OU' }],
          handsLayout: [{ pieceId: 11, pieceCode: 'FU', count: 1 }],
          selectedPieceIds: [2, 11],
          validationSummary: { boardPieceCount: 1, handPieceCount: 1, totalSelectedPieces: 2 },
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
      ],
    ]);
    const battleSetupClient = {
      async getBattleSetup(battleSetupId: string, ownerUserId: string) {
        const found = battleSetups.get(battleSetupId);
        if (!found || found.ownerUserId !== ownerUserId) {
          throw new Error('Battle setup not found');
        }
        return found;
      },
    };
    const matchmaking = new MatchmakingService(
      queueRepository,
      matchRepository,
      new BffEventPublisher(eventRepository),
      new BasicRuleEngine(),
      new RuleSnapshotBuilder(new InMemoryPieceCatalogProvider()),
      battleSetupClient as any,
      config,
    );

    await queueService.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
      battleSetupId: 'bsetup_black',
    });
    await queueService.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1500,
      battleSetupId: 'bsetup_white',
    });

    const match = await matchmaking.runOnce();
    const pending = await eventRepository.listPending();

    expect(match).not.toBeNull();
    expect(match?.game.boardState['5i']).toBe('black:OU');
    expect(match?.game.boardState['5a']).toBe('white:OU');
    expect(match?.game.handsState.black.FU).toBe(2);
    expect(match?.game.handsState.white.FU).toBe(1);
    expect(pending.filter((event) => event.eventType === 'battle_setup.consume')).toHaveLength(2);
  });
});
