import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { BffPieceCatalogProvider } from '@/catalog/bff-piece-catalog';
import { InMemoryPieceCatalogProvider } from '@/catalog/default-piece-catalog';
import { RuleSnapshotBuilder } from '@/catalog/rule-snapshot';
import { AppShogiRuleEngine } from '@/game/app-shogi-rule-engine';
import { AppShogiValidatorClient } from '@/integrations/app-shogi-validator';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { loadConfig } from '@/lib/config';
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
};

export function createServerContext(overrides: ServerContextOverrides = {}) {
  const config = loadConfig();
  const appShogiRoot = config.appShogiRoot ?? findBundledAppShogiRoot();
  const connections = overrides.repositories?.connections ?? new InMemoryConnectionRepository();
  const queue = overrides.repositories?.queue ?? new InMemoryQueueRepository();
  const matches = overrides.repositories?.matches ?? new InMemoryMatchRepository();
  const integrationEvents =
    overrides.repositories?.integrationEvents ?? new InMemoryIntegrationEventRepository();
  const pieceCatalog = config.bffBaseUrl
    ? new BffPieceCatalogProvider(config.bffBaseUrl)
    : new InMemoryPieceCatalogProvider();
  const appShogiValidator = appShogiRoot
    ? new AppShogiValidatorClient(appShogiRoot)
    : null;
  const ruleSnapshotBuilder = new RuleSnapshotBuilder(
    pieceCatalog,
    appShogiValidator
      ? (items) => appShogiValidator.normalizePieceCatalogItems(items)
      : undefined,
  );
  const ruleEngine = appShogiValidator
    ? new AppShogiRuleEngine(appShogiRoot!)
    : new BasicRuleEngine();
  const eventPublisher = new BffEventPublisher(integrationEvents);
  const battleSetupClient = config.bffBaseUrl
    ? new BffBattleSetupClient(config.bffBaseUrl, config.bffInternalToken ?? null)
    : null;
  const matchResultClient = config.bffBaseUrl
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

function findBundledAppShogiRoot() {
  const candidates = [
    process.env.LAMBDA_TASK_ROOT,
    process.cwd(),
    __dirname,
  ].filter((value): value is string => Boolean(value));
  return (
    candidates.find(
      (dir) =>
        existsSync(resolve(dir, 'online-move-validator.cjs')) ||
        existsSync(resolve(dir, 'online-move-validator.js')),
    ) ?? null
  );
}
