import { createId } from '@/lib/id';
import { nowIso } from '@/lib/time';
import type { MatchingServerConfig } from '@/lib/config';
import { RuleSnapshotBuilder } from '@/catalog/rule-snapshot';
import { createInitialGameFromBattleSetups } from '@/game/initial-board';
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
    const buckets = await this.queueRepository.listWaitingBuckets(
      this.config.matchmakingBucketScanLimit,
    );
    for (const bucket of buckets) {
      const created = await this.tryCreateMatchFromBucket(bucket, buckets);
      if (created) return created;
    }
    return null;
  }

  async runBatch(maxMatches = this.config.matchmakingBatchSize) {
    const matches: MatchSession[] = [];
    const limit = Math.max(1, Math.floor(maxMatches));
    for (let index = 0; index < limit; index += 1) {
      const match = await this.runOnce();
      if (!match) break;
      matches.push(match);
    }
    return matches;
  }

  private async tryCreateMatchFromBucket(bucket: number, allBuckets: number[]) {
    const seedCandidates = await this.queueRepository.listWaitingByBucket(
      bucket,
      this.config.matchmakingBucketCandidateLimit,
    );
    for (const seed of seedCandidates) {
      const match = await this.tryCreateMatchForSeed(seed, allBuckets);
      if (match) return match;
    }
    return null;
  }

  private async tryCreateMatchForSeed(seed: QueueEntry, allBuckets: number[]) {
    const seedToken = createId('mtok');
    const opponent = await this.findOpponent(seed, allBuckets);
    if (!opponent) return null;

    const reservedPair = await this.queueRepository.reserveWaitingPair(
      seed.queueEntryId,
      opponent.queueEntryId,
      seedToken,
    );
    if (!reservedPair) return null;

    let match: MatchSession;
    try {
      match = await this.createMatch(seed, opponent);
    } catch (error) {
      await Promise.all([
        this.queueRepository.releaseReservation(seed.queueEntryId, seedToken),
        this.queueRepository.releaseReservation(opponent.queueEntryId, seedToken),
      ]);
      await this.removeQueueEntriesAfterMatchFailure(seed, opponent);
      throw error;
    }
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
      battleReadyBlack: false,
      battleReadyWhite: false,
      turnClockStartedAt: null,
      ruleSnapshot,
      game: initialGame,
    };
    await this.matchRepository.save(match);
    if (black.battleSetupId && white.battleSetupId) {
      await Promise.all([
        this.eventPublisher.publishBattleSetupConsume({
          battleSetupId: black.battleSetupId,
          ownerUserId: black.userId,
        }),
        this.eventPublisher.publishBattleSetupConsume({
          battleSetupId: white.battleSetupId,
          ownerUserId: white.userId,
        }),
      ]);
    }
    return match;
  }

  private async findOpponent(seed: QueueEntry, allBuckets: number[]) {
    const orderedBuckets = this.config.experimentalWideRatingMatch
      ? allBuckets
      : expandBuckets(seed.ratingBucket, this.config.ratingBucketSize, allBuckets);

    for (const bucket of orderedBuckets) {
      const entries = await this.queueRepository.listWaitingByBucket(
        bucket,
        this.config.matchmakingBucketCandidateLimit,
      );
      const opponent = entries.find((entry) => entry.userId !== seed.userId);
      if (opponent) return opponent;
    }
    return null;
  }

  private async buildInitialGame(ruleSnapshot: MatchSession['ruleSnapshot'], black: QueueEntry, white: QueueEntry) {
    if (!this.battleSetupClient || !black.battleSetupId || !white.battleSetupId) {
      return this.ruleEngine.createInitialGame(ruleSnapshot);
    }

    try {
      const [blackSetup, whiteSetup] = await Promise.all([
        this.battleSetupClient.getBattleSetup(black.battleSetupId, black.userId),
        this.battleSetupClient.getBattleSetup(white.battleSetupId, white.userId),
      ]);
      return createInitialGameFromBattleSetups({
        rules: ruleSnapshot,
        blackSetup,
        whiteSetup,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[matchmaking] failed to load battle setups', {
        blackSetupId: black.battleSetupId,
        whiteSetupId: white.battleSetupId,
        message,
      });
      throw error;
    }
  }

  private async removeQueueEntriesAfterMatchFailure(seed: QueueEntry, opponent: QueueEntry) {
    await Promise.all([
      this.queueRepository.cancelByUserId(seed.userId).catch(() => false),
      this.queueRepository.cancelByUserId(opponent.userId).catch(() => false),
    ]);
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

