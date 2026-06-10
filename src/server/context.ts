import { BffPieceCatalogProvider } from '@/catalog/bff-piece-catalog';
import { InMemoryPieceCatalogProvider } from '@/catalog/default-piece-catalog';
import { MergedPieceCatalogProvider } from '@/catalog/merged-piece-catalog';
import type { PieceCatalogProvider } from '@/catalog/contracts';
import { RuleSnapshotBuilder } from '@/catalog/rule-snapshot';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { loadConfig, type MatchingServerConfig } from '@/lib/config';
import { BffBattleSetupClient } from '@/integrations/bff-battle-setup-client';
import { BffEventPublisher } from '@/integrations/bff-event-publisher';
import { BffMatchResultClient } from '@/integrations/bff-match-result-client';
import { BffPvpRatingClient } from '@/integrations/bff-pvp-rating-client';
import { InMemoryConnectionRepository } from '@/repositories/memory/connection-repository';
import { InMemoryIntegrationEventRepository } from '@/repositories/memory/integration-event-repository';
import { InMemoryMatchRepository } from '@/repositories/memory/match-repository';
import { InMemoryQueueRepository } from '@/repositories/memory/queue-repository';
import type {
  ConnectionRepository,
  IntegrationEventRepository,
  MatchRepository,
  QueueRepository,
} from '@/repositories/contracts';
import { GameCommandService } from '@/services/game-command';
import { MatchmakingService } from '@/services/matchmaking';
import { OutboxWorkerService } from '@/services/outbox-worker';
import { QueueService } from '@/services/queue';

export type ServerContextOverrides = {
  repositories?: {
    connections?: ConnectionRepository;
    queue?: QueueRepository;
    matches?: MatchRepository;
    integrationEvents?: IntegrationEventRepository;
  };
  pieceCatalog?: PieceCatalogProvider;
};

function shouldUseInMemoryPieceCatalog(config: MatchingServerConfig): boolean {
  if (process.env.MATCHING_USE_IN_MEMORY_CATALOG === 'true') return true;
  if (process.env.CI === 'true') return true;
  return !config.bffBaseUrl;
}

export function createServerContext(overrides: ServerContextOverrides = {}) {
  const config = loadConfig();
  const useInMemoryCatalog = overrides.pieceCatalog != null || shouldUseInMemoryPieceCatalog(config);
  const connections = overrides.repositories?.connections ?? new InMemoryConnectionRepository();
  const queue = overrides.repositories?.queue ?? new InMemoryQueueRepository();
  const matches = overrides.repositories?.matches ?? new InMemoryMatchRepository();
  const integrationEvents =
    overrides.repositories?.integrationEvents ?? new InMemoryIntegrationEventRepository();
  const pieceCatalog =
    overrides.pieceCatalog ??
    (useInMemoryCatalog
      ? new InMemoryPieceCatalogProvider()
      : new MergedPieceCatalogProvider(
          new BffPieceCatalogProvider(config.bffBaseUrl!),
          new InMemoryPieceCatalogProvider(),
        ));
  const ruleSnapshotBuilder = new RuleSnapshotBuilder(pieceCatalog);
  const ruleEngine = new BasicRuleEngine();
  const eventPublisher = new BffEventPublisher(integrationEvents);
  const battleSetupClient =
    !useInMemoryCatalog && config.bffBaseUrl
      ? new BffBattleSetupClient(config.bffBaseUrl, config.bffInternalToken ?? null)
      : null;
  const matchResultClient =
    !useInMemoryCatalog && config.bffBaseUrl
      ? new BffMatchResultClient(config.bffBaseUrl, config.bffInternalToken ?? null)
      : null;
  const pvpRatingClient = BffPvpRatingClient.fromConfig(config);
  return {
    config,
    repositories: {
      connections,
      queue,
      matches,
      integrationEvents,
      pieceCatalog,
    },
    services: {
      queue: new QueueService(queue, config),
      matchmaking: new MatchmakingService(
        queue,
        matches,
        eventPublisher,
        ruleEngine,
        ruleSnapshotBuilder,
        battleSetupClient,
        config,
      ),
      gameCommand: new GameCommandService(
        matches,
        eventPublisher,
        ruleEngine,
        config,
      ),
      outboxWorker: new OutboxWorkerService(
        integrationEvents,
        matchResultClient,
        pvpRatingClient,
        battleSetupClient,
      ),
    },
  };
}

export type ServerContext = ReturnType<typeof createServerContext>;
