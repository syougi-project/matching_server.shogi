import { describe, expect, test } from 'bun:test';

import { InMemoryPieceCatalogProvider } from '@/catalog/default-piece-catalog';
import { RuleSnapshotBuilder } from '@/catalog/rule-snapshot';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { BffEventPublisher } from '@/integrations/bff-event-publisher';
import { DEV_BOT_USER_ID } from '@/lib/dev-bot';
import { InMemoryIntegrationEventRepository } from '@/repositories/memory/integration-event-repository';
import { InMemoryMatchRepository } from '@/repositories/memory/match-repository';
import { InMemoryQueueRepository } from '@/repositories/memory/queue-repository';
import { createServerContext } from '@/server/context';
import { MatchmakingService } from '@/services/matchmaking';
import { QueueService } from '@/services/queue';
import type { BattleSetupSnapshot } from '@/types/domain';

const config = {
  ratingBucketSize: 100,
  experimentalWideRatingMatch: true,
  reconnectGraceSeconds: 30,
  queueTtlSeconds: 120,
  matchmakingBatchSize: 20,
  matchmakingBucketScanLimit: 50,
  matchmakingBucketCandidateLimit: 25,
  bffBaseUrl: null,
  appShogiRoot: null,
} as const;

describe('dev bot matchmaking', () => {
  test('uses the human battle setup for both sides when matched with the dev bot', async () => {
    const queueRepository = new InMemoryQueueRepository();
    const matchRepository = new InMemoryMatchRepository();
    const eventRepository = new InMemoryIntegrationEventRepository();
    const queueService = new QueueService(queueRepository, config);
    const humanSetup: BattleSetupSnapshot = {
      battleSetupId: 'bsetup_human',
      ownerUserId: 'user-human',
      status: 'locked',
      name: 'human',
      boardLayout: [{ row: 8, col: 4, pieceId: 1, pieceCode: 'ou' }],
      handsLayout: [{ pieceId: 10, pieceCode: 'fu', count: 2 }],
      selectedPieceIds: [1, 10],
      validationSummary: { boardPieceCount: 1, handPieceCount: 2, totalSelectedPieces: 2 },
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
    };
    const battleSetupClient = {
      async getBattleSetup(battleSetupId: string, ownerUserId: string) {
        if (battleSetupId !== humanSetup.battleSetupId || ownerUserId !== humanSetup.ownerUserId) {
          throw new Error('Battle setup not found');
        }
        return humanSetup;
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
      userId: 'user-human',
      connectionId: 'conn-human',
      rating: 1500,
      battleSetupId: humanSetup.battleSetupId,
    });
    await queueService.enterQueue({
      userId: DEV_BOT_USER_ID,
      connectionId: 'conn-bot',
      rating: 1500,
    });

    const match = await matchmaking.runOnce();
    expect(match).not.toBeNull();
    expect(match!.game.boardState['5i']).toBe('black:OU');
    expect(match!.game.boardState['5a']).toBe('white:OU');
    expect(match!.game.handsState.black.FU).toBe(2);
    expect(match!.game.handsState.white.FU).toBe(2);
  });
});

describe('dev bot battle ready', () => {
  test('starts the turn clock when the human signals ready against the dev bot', async () => {
    const context = createServerContext();
    await context.services.queue.enterQueue({
      userId: 'user-human',
      connectionId: 'conn-human',
      rating: 1500,
      battleSetupId: 'bsetup_human',
    });
    await context.services.queue.enterQueue({
      userId: DEV_BOT_USER_ID,
      connectionId: 'conn-bot',
      rating: 1500,
    });

    const match = await context.services.matchmaking.runOnce();
    expect(match).not.toBeNull();

    const ready = await context.services.gameCommand.signalBattleReady(
      match!.matchId,
      match!.playerBlackUserId === 'user-human'
        ? match!.playerBlackUserId
        : match!.playerWhiteUserId,
    );

    expect(ready.clockJustStarted).toBe(true);
    expect(ready.match.turnClockStartedAt).not.toBeNull();
    expect(ready.match.battleReadyBlack).toBe(true);
    expect(ready.match.battleReadyWhite).toBe(true);
  });
});
