import { DomainError } from '@/lib/errors';
import { addSeconds, nowIso } from '@/lib/time';
import type { MatchingServerConfig } from '@/lib/config';
import type { RuleEngine } from '@/game/rule-engine';
import { BffEventPublisher } from '@/integrations/bff-event-publisher';
import type { BffPvpRatingClient } from '@/integrations/bff-pvp-rating-client';
import type { MatchRepository } from '@/repositories/contracts';
import type { MatchSession, MovePayload, PlayerSide } from '@/types/domain';

export class GameCommandService {
  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly eventPublisher: BffEventPublisher,
    private readonly ruleEngine: RuleEngine,
    private readonly config: MatchingServerConfig,
    private readonly pvpRatingClient: BffPvpRatingClient | null = null,
  ) {}

  private async publishFinished(match: MatchSession) {
    await this.eventPublisher.publishMatchEvent(match, 'match.finished');
    if (this.pvpRatingClient) {
      await this.pvpRatingClient.applyMatchFinished(match);
    }
  }

  async makeMove(input: {
    matchId: string;
    userId: string;
    expectedVersion: number;
    move: MovePayload;
  }) {
    const match = await this.requireMatch(input.matchId);
    if (match.status !== 'started') {
      throw new DomainError('MATCH_NOT_ACTIVE', 'Match is not in started state.');
    }

    const actorSide = sideForUser(match, input.userId);
    if (!actorSide) {
      throw new DomainError('MATCH_ACCESS_DENIED', 'User does not belong to this match.');
    }

    if (match.game.version !== input.expectedVersion) {
      throw new DomainError('VERSION_MISMATCH', `Current version is ${match.game.version}.`);
    }

    const result = this.ruleEngine.applyMove({
      game: match.game,
      rules: match.ruleSnapshot,
      actorSide,
      move: input.move,
    });
    if (!result.ok) {
      throw new DomainError(result.code, result.message);
    }

    const nextMatch: MatchSession = {
      ...match,
      game: result.nextGame,
    };
    const winnerUserId =
      result.ok && result.finished
        ? result.finished.winnerSide === 'black'
          ? match.playerBlackUserId
          : match.playerWhiteUserId
        : null;
    const resolvedMatch: MatchSession =
      result.ok && result.finished
        ? {
            ...nextMatch,
            status: 'finished',
            finishedAt: nowIso(),
            winnerUserId,
            endReason: result.finished.reason,
          }
        : nextMatch;
    const updated = await this.matchRepository.updateGameIfVersion(
      match.matchId,
      input.expectedVersion,
      resolvedMatch,
    );
    if (!updated) {
      throw new DomainError('VERSION_MISMATCH', 'Match state changed before move was stored.');
    }

    if (result.finished) {
      await this.eventPublisher.publishMatchEvent(resolvedMatch, 'match.finished');
    }

    return resolvedMatch;
  }

  async resign(matchId: string, userId: string) {
    const match = await this.requireMatch(matchId);
    if (match.status !== 'started') {
      throw new DomainError('MATCH_NOT_ACTIVE', 'Match is not in started state.');
    }

    const actorSide = sideForUser(match, userId);
    if (!actorSide) {
      throw new DomainError('MATCH_ACCESS_DENIED', 'User does not belong to this match.');
    }

    const winnerUserId =
      actorSide === 'black' ? match.playerWhiteUserId : match.playerBlackUserId;
    const finished: MatchSession = {
      ...match,
      status: 'finished',
      finishedAt: nowIso(),
      winnerUserId,
      endReason: 'resign',
    };
    await this.matchRepository.save(finished);
    await this.publishFinished(finished);
    return finished;
  }

  async disconnect(matchId: string, userId: string) {
    const match = await this.requireMatch(matchId);
    const side = sideForUser(match, userId);
    if (!side) {
      throw new DomainError('MATCH_ACCESS_DENIED', 'User does not belong to this match.');
    }
    const now = nowIso();
    const next: MatchSession = {
      ...match,
      disconnectedAtBlack: side === 'black' ? now : match.disconnectedAtBlack,
      disconnectedAtWhite: side === 'white' ? now : match.disconnectedAtWhite,
      reconnectDeadlineAt: addSeconds(now, this.config.reconnectGraceSeconds),
    };
    await this.matchRepository.save(next);
    return next;
  }

  async reconnect(matchId: string, userId: string, connectionId: string) {
    const match = await this.requireMatch(matchId);
    const side = sideForUser(match, userId);
    if (!side) {
      throw new DomainError('MATCH_ACCESS_DENIED', 'User does not belong to this match.');
    }
    const next: MatchSession = {
      ...match,
      playerBlackConnectionId: side === 'black' ? connectionId : match.playerBlackConnectionId,
      playerWhiteConnectionId: side === 'white' ? connectionId : match.playerWhiteConnectionId,
      disconnectedAtBlack: side === 'black' ? null : match.disconnectedAtBlack,
      disconnectedAtWhite: side === 'white' ? null : match.disconnectedAtWhite,
      reconnectDeadlineAt: null,
    };
    await this.matchRepository.save(next);
    return next;
  }

  async abortExpiredReconnect(matchId: string) {
    const match = await this.requireMatch(matchId);
    if (!match.reconnectDeadlineAt) return null;
    if (new Date(match.reconnectDeadlineAt).getTime() > Date.now()) return null;
    const aborted: MatchSession = {
      ...match,
      status: 'aborted',
      finishedAt: nowIso(),
      endReason: 'disconnect_timeout',
    };
    await this.matchRepository.save(aborted);
    await this.eventPublisher.publishMatchEvent(aborted, 'match.aborted');
    return aborted;
  }

  private async requireMatch(matchId: string) {
    const match = await this.matchRepository.findById(matchId);
    if (!match) {
      throw new DomainError('MATCH_NOT_FOUND', 'Match session was not found.');
    }
    return match;
  }
}

function sideForUser(match: MatchSession, userId: string): PlayerSide | null {
  if (match.playerBlackUserId === userId) return 'black';
  if (match.playerWhiteUserId === userId) return 'white';
  return null;
}
