import { isDevBotUserId } from '@/lib/dev-bot';
import { DomainError } from '@/lib/errors';
import { isBattleClockStarted } from '@/lib/battle-clock';
import { addSeconds, nowIso } from '@/lib/time';
import type { MatchingServerConfig } from '@/lib/config';
import type { RuleEngine } from '@/game/rule-engine';
import type { MatchRepository } from '@/repositories/contracts';
import type { MatchEventPublisher } from '@/services/ports';
import type { MatchSession, MovePayload, PlayerSide } from '@/types/domain';

export class GameCommandService {
  constructor(
    private readonly matchRepository: MatchRepository,
    private readonly eventPublisher: MatchEventPublisher,
    private readonly ruleEngine: RuleEngine,
    private readonly config: MatchingServerConfig,
  ) {}

  private async publishFinished(match: MatchSession) {
    await this.eventPublisher.publishMatchEvent(match, 'match.finished');
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
    if (!isBattleClockStarted(match)) {
      throw new DomainError(
        'BATTLE_NOT_READY',
        'Both players must enter the battle screen before making moves.',
      );
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
      await this.publishFinished(resolvedMatch);
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
    if (match.status !== 'started') {
      return match;
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

  async signalBattleReady(matchId: string, userId: string) {
    const match = await this.requireMatch(matchId);
    if (match.status !== 'started') {
      return { match, clockJustStarted: false, resendClockStarted: false };
    }

    const side = sideForUser(match, userId);
    if (!side) {
      throw new DomainError('MATCH_ACCESS_DENIED', 'User does not belong to this match.');
    }

    const alreadyReady = side === 'black' ? match.battleReadyBlack : match.battleReadyWhite;
    if (alreadyReady) {
      return {
        match,
        clockJustStarted: false,
        resendClockStarted: isBattleClockStarted(match),
      };
    }

    const next: MatchSession = {
      ...match,
      battleReadyBlack: side === 'black' ? true : match.battleReadyBlack,
      battleReadyWhite: side === 'white' ? true : match.battleReadyWhite,
    };
    // 開発用ボットは WebSocket クライアントが無いため、人間側の準備完了と同時に開始する。
    if (isDevBotUserId(match.playerBlackUserId)) {
      next.battleReadyBlack = true;
    }
    if (isDevBotUserId(match.playerWhiteUserId)) {
      next.battleReadyWhite = true;
    }
    let clockJustStarted = false;
    if (next.battleReadyBlack && next.battleReadyWhite && !next.turnClockStartedAt) {
      next.turnClockStartedAt = nowIso();
      clockJustStarted = true;
    }
    await this.matchRepository.save(next);
    return { match: next, clockJustStarted, resendClockStarted: false };
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
    if (match.status !== 'started') return null;
    if (!match.reconnectDeadlineAt) return null;
    if (new Date(match.reconnectDeadlineAt).getTime() > Date.now()) return null;

    const disconnectedSide = sideForDisconnectedPlayer(match);
    if (!disconnectedSide) return null;

    const winnerUserId =
      disconnectedSide === 'black' ? match.playerWhiteUserId : match.playerBlackUserId;
    const finished: MatchSession = {
      ...match,
      status: 'finished',
      finishedAt: nowIso(),
      winnerUserId,
      endReason: 'disconnect',
      reconnectDeadlineAt: null,
      disconnectedAtBlack: null,
      disconnectedAtWhite: null,
    };
    await this.matchRepository.save(finished);
    await this.publishFinished(finished);
    return finished;
  }

  async findMatch(matchId: string) {
    return this.matchRepository.findById(matchId);
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

function sideForDisconnectedPlayer(match: MatchSession): PlayerSide | null {
  if (match.disconnectedAtBlack && !match.disconnectedAtWhite) return 'black';
  if (match.disconnectedAtWhite && !match.disconnectedAtBlack) return 'white';
  if (match.disconnectedAtBlack && match.disconnectedAtWhite) {
    return match.disconnectedAtBlack >= match.disconnectedAtWhite ? 'black' : 'white';
  }
  return null;
}
