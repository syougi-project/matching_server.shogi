import { describe, expect, test } from 'bun:test';
import { createServerContext } from '@/server/context';
import { MatchingCore } from '@/server/matching-core';

describe('MatchingCore king capture', () => {
  test('broadcasts game_finished to both players when a king is captured', async () => {
    const context = createServerContext();
    const core = new MatchingCore(context);

    await context.services.queue.enterQueue({
      userId: 'user-1',
      connectionId: 'conn-1',
      rating: 1500,
    });
    await context.services.queue.enterQueue({
      userId: 'user-2',
      connectionId: 'conn-2',
      rating: 1500,
    });

    let match = await context.services.matchmaking.runOnce();
    expect(match).not.toBeNull();
    match = await context.services.gameCommand.signalBattleReady(
      match!.matchId,
      match!.playerBlackUserId,
    ).then(() =>
      context.services.gameCommand.signalBattleReady(match!.matchId, match!.playerWhiteUserId),
    ).then(({ match: readyMatch }) => readyMatch);

    await context.repositories.matches.save({
      ...match!,
      game: {
        ...match!.game,
        boardState: {
          '5i': 'black:OU',
          '5e': 'black:KA',
          '4d': 'white:OU',
        },
        handsState: { black: {}, white: {} },
        turn: 'black',
        version: 3,
      },
    });

    const result = await core.handleClientMessage('conn-1', {
      action: 'make_move',
      requestId: 'req-king',
      userId: match!.playerBlackUserId,
      matchId: match!.matchId,
      expectedVersion: 3,
      move: { from: '5e', to: '4d', piece: 'KA' },
    });

    expect(result.response.type).toBe('game_state_updated');
    expect(result.match?.status).toBe('finished');
    expect(result.match?.endReason).toBe('king_capture');
    expect(result.broadcasts).toContainEqual({
      userId: match!.playerWhiteUserId,
      message: expect.objectContaining({ type: 'game_state_updated' }),
    });
    expect(result.broadcasts).toContainEqual({
      userId: match!.playerBlackUserId,
      message: {
        type: 'game_finished',
        matchId: match!.matchId,
        status: 'finished',
        winnerUserId: match!.playerBlackUserId,
        reason: 'king_capture',
      },
    });
    expect(result.broadcasts).toContainEqual({
      userId: match!.playerWhiteUserId,
      message: {
        type: 'game_finished',
        matchId: match!.matchId,
        status: 'finished',
        winnerUserId: match!.playerBlackUserId,
        reason: 'king_capture',
      },
    });
  });
});
