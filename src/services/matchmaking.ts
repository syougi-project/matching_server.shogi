import { createId } from '@/lib/id';
import { nowIso } from '@/lib/time';
import type { MatchingServerConfig } from '@/lib/config';
import { RuleSnapshotBuilder } from '@/catalog/rule-snapshot';
import { createInitialGameFromBattleSetups } from '@/game/initial-board';
import { AppShogiRuleEngine } from '@/game/app-shogi-rule-engine';
import type { RuleEngine } from '@/game/rule-engine';
import { BffBattleSetupClient } from '@/integrations/bff-battle-setup-client';
import { BffEventPublisher } from '@/integrations/bff-event-publisher';
import type { MatchRepository, QueueRepository } from '@/repositories/contracts';
import type { MatchSession, PlayerSide, QueueEntry } from '@/types/domain';
import type { MatchFoundMessage } from '@/types/protocol';

export class MatchmakingService {
  constructor(
    private readonly queueRepository: QueueRepository,
    private readonly matchRepository: MatchRepository,
    private readonly eventPublisher: BffEventPublisher,
    private readonly ruleEngine: RuleEngine,
    private readonly ruleSnapshotBuilder: RuleSnapshotBuilder,
    private readonly battleSetupClient: BffBattleSetupClient | null,
    private readonly config: MatchingServerConfig,
  ) {}

  async runOnce() {
    const buckets = await this.queueRepository.listWaitingBuckets();
    for (const bucket of buckets) {
      const created = await this.tryCreateMatchFromBucket(bucket, buckets);
      if (created) return created;
    }
    return null;
  }

  private async tryCreateMatchFromBucket(bucket: number, allBuckets: number[]) {
    const seedCandidates = await this.queueRepository.listWaitingByBucket(bucket);
    for (const seed of seedCandidates) {
      const match = await this.tryCreateMatchForSeed(seed, allBuckets);
      if (match) return match;
    }
    return null;
  }

  private async tryCreateMatchForSeed(seed: QueueEntry, allBuckets: number[]) {
    const seedToken = createId('mtok');
    const reservedSeed = await this.queueRepository.reserveWaitingEntry(seed.queueEntryId, seedToken);
    if (!reservedSeed) return null;

    const opponent = await this.findOpponent(seed, allBuckets);
    if (!opponent) {
      await this.queueRepository.releaseReservation(seed.queueEntryId, seedToken);
      return null;
    }

    const opponentToken = createId('mtok');
    const reservedOpponent = await this.queueRepository.reserveWaitingEntry(
      opponent.queueEntryId,
      opponentToken,
    );
    if (!reservedOpponent) {
      await this.queueRepository.releaseReservation(seed.queueEntryId, seedToken);
      return null;
    }

    const match = await this.createMatch(seed, opponent);
    const matchedAt = nowIso();
    await this.queueRepository.markMatched(seed.queueEntryId, match.matchId, matchedAt);
    await this.queueRepository.markMatched(opponent.queueEntryId, match.matchId, matchedAt);
    await this.eventPublisher.publishMatchEvent(match, 'match.started');
    return match;
  }

  private async createMatch(seed: QueueEntry, opponent: QueueEntry) {
    const matchId = createId('match');
    const startedAt = nowIso();
    const ruleSnapshot = await this.ruleSnapshotBuilder.buildSnapshot();
    const [black, white] =
      seed.enqueuedAt <= opponent.enqueuedAt ? ([seed, opponent] as const) : ([opponent, seed] as const);

    const initialGame = await this.buildInitialGame(ruleSnapshot, black, white);
    const match: MatchSession = {
      matchId,
      status: 'started',
      playerBlackUserId: black.userId,
      playerWhiteUserId: white.userId,
      playerBlackProfile: profileFromQueue(black),
      playerWhiteProfile: profileFromQueue(white),
      playerBlackConnectionId: black.connectionId,
      playerWhiteConnectionId: white.connectionId,
      startedAt,
      finishedAt: null,
      winnerUserId: null,
      endReason: null,
      disconnectedAtBlack: null,
      disconnectedAtWhite: null,
      reconnectDeadlineAt: null,
      ruleSnapshot,
      game: initialGame,
    };
    await this.matchRepository.save(match);
    return match;
  }

  private async findOpponent(seed: QueueEntry, allBuckets: number[]) {
    const orderedBuckets = expandBuckets(seed.ratingBucket, this.config.ratingBucketSize, allBuckets);
    for (const bucket of orderedBuckets) {
      const entries = await this.queueRepository.listWaitingByBucket(bucket);
      const opponent = entries.find((entry) => entry.userId !== seed.userId);
      if (opponent) return opponent;
    }
    return null;
  }

  private async buildInitialGame(ruleSnapshot: MatchSession['ruleSnapshot'], black: QueueEntry, white: QueueEntry) {
    if (!this.battleSetupClient || !black.battleSetupId || !white.battleSetupId) {
      return this.ruleEngine.createInitialGame(ruleSnapshot);
    }

    const [blackSetup, whiteSetup] = await Promise.all([
      this.battleSetupClient.getBattleSetup(black.battleSetupId, black.userId),
      this.battleSetupClient.getBattleSetup(white.battleSetupId, white.userId),
    ]);
    if (typeof this.battleSetupClient.consumeBattleSetup === 'function') {
      await Promise.all([
        this.battleSetupClient.consumeBattleSetup(black.battleSetupId, black.userId),
        this.battleSetupClient.consumeBattleSetup(white.battleSetupId, white.userId),
      ]);
    }

    const base = createInitialGameFromBattleSetups({
      rules: ruleSnapshot,
      blackSetup,
      whiteSetup,
    });
    if (this.ruleEngine instanceof AppShogiRuleEngine) {
      return this.ruleEngine.attachCanonical(base, ruleSnapshot);
    }
    return base;
  }
}

function profileFromQueue(entry: QueueEntry) {
  return {
    userId: entry.userId,
    displayName: entry.displayName,
    rating: entry.rating,
  };
}

export function expandBuckets(origin: number, bucketSize: number, availableBuckets: number[]) {
  const normalized = new Set(availableBuckets);
  const ordered: number[] = [];
  if (normalized.has(origin)) ordered.push(origin);
  for (let step = 1; step <= normalized.size + 1; step += 1) {
    const lower = origin - bucketSize * step;
    const upper = origin + bucketSize * step;
    if (normalized.has(lower)) ordered.push(lower);
    if (normalized.has(upper)) ordered.push(upper);
  }
  return ordered;
}

export function roleForUser(match: MatchSession, userId: string): PlayerSide | null {
  if (match.playerBlackUserId === userId) return 'black';
  if (match.playerWhiteUserId === userId) return 'white';
  return null;
}

export function buildMatchFoundMessage(match: MatchSession, userId: string): MatchFoundMessage {
  const role = roleForUser(match, userId);
  if (!role) {
    throw new Error(`User ${userId} is not part of match ${match.matchId}`);
  }
  const selfIsBlack = role === 'black';
  return {
    type: 'match_found',
    matchId: match.matchId,
    role,
    self: selfIsBlack ? match.playerBlackProfile : match.playerWhiteProfile,
    opponent: selfIsBlack ? match.playerWhiteProfile : match.playerBlackProfile,
  };
}
