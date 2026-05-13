import { BffPieceCatalogProvider } from '@/catalog/bff-piece-catalog';
import { InMemoryPieceCatalogProvider } from '@/catalog/default-piece-catalog';
import { RuleSnapshotBuilder } from '@/catalog/rule-snapshot';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { loadConfig } from '@/lib/config';
import { BffBattleSetupClient } from '@/integrations/bff-battle-setup-client';
import { BffEventPublisher } from '@/integrations/bff-event-publisher';
import { InMemoryConnectionRepository } from '@/repositories/memory/connection-repository';
import { InMemoryIntegrationEventRepository } from '@/repositories/memory/integration-event-repository';
import { InMemoryMatchRepository } from '@/repositories/memory/match-repository';
import { InMemoryQueueRepository } from '@/repositories/memory/queue-repository';
import { GameCommandService } from '@/services/game-command';
import { MatchmakingService } from '@/services/matchmaking';
import { QueueService } from '@/services/queue';

export function createServerContext() {
  const config = loadConfig();
  const connections = new InMemoryConnectionRepository();
  const queue = new InMemoryQueueRepository();
  const matches = new InMemoryMatchRepository();
  const integrationEvents = new InMemoryIntegrationEventRepository();
  const pieceCatalog = config.bffBaseUrl
    ? new BffPieceCatalogProvider(config.bffBaseUrl)
    : new InMemoryPieceCatalogProvider();
  const ruleSnapshotBuilder = new RuleSnapshotBuilder(pieceCatalog);
  const ruleEngine = new BasicRuleEngine();
  const eventPublisher = new BffEventPublisher(integrationEvents);
  const battleSetupClient = config.bffBaseUrl ? new BffBattleSetupClient(config.bffBaseUrl) : null;

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
      gameCommand: new GameCommandService(matches, eventPublisher, ruleEngine, config),
    },
  };
}

export type ServerContext = ReturnType<typeof createServerContext>;
