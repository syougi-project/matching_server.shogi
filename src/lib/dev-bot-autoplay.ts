import { pickLegalMoveForBot } from '@/game/basic-rule-engine';
import { isBattleClockStarted } from '@/lib/battle-clock';
import { DEV_BOT_USER_ID, isDevBotMatch, isDevBotUserId } from '@/lib/dev-bot';
import type { ServerContext } from '@/server/context';
import type { MatchSession, PlayerSide } from '@/types/domain';

export async function tryPlayDevBotMove(
  context: ServerContext,
  match: MatchSession,
): Promise<MatchSession | null> {
  if (!isDevBotMatch(match)) return null;
  if (match.status !== 'started' || !isBattleClockStarted(match)) return null;

  const botSide: PlayerSide = isDevBotUserId(match.playerBlackUserId) ? 'black' : 'white';
  if (match.game.turn !== botSide) return null;

  const move = pickLegalMoveForBot(match.game, match.ruleSnapshot, botSide);
  if (!move) return null;

  return context.services.gameCommand.makeMove({
    matchId: match.matchId,
    userId: DEV_BOT_USER_ID,
    expectedVersion: match.game.version,
    move,
  });
}
