import { AppShogiValidatorClient } from '@/integrations/app-shogi-validator';
import type { ApplyMoveInput, ApplyMoveResult, RuleEngine } from '@/game/rule-engine';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import type { GameSnapshot, RuleSnapshot } from '@/types/domain';

export class AppShogiRuleEngine implements RuleEngine {
  private readonly fallback = new BasicRuleEngine();
  private readonly validator: AppShogiValidatorClient;

  constructor(appShogiRoot: string) {
    this.validator = new AppShogiValidatorClient(appShogiRoot);
  }

  createInitialGame(rules: RuleSnapshot): GameSnapshot {
    const base = this.fallback.createInitialGame(rules);
    return this.attachCanonical(base, rules);
  }

  attachCanonical(game: GameSnapshot, rules: RuleSnapshot): GameSnapshot {
    const synced = this.validator.syncFromWire(game, rules);
    if (!synced.ok) {
      throw new Error(`${synced.code}: ${synced.message}`);
    }
    return synced.wire;
  }

  applyMove(input: ApplyMoveInput): ApplyMoveResult {
    if (input.game.turn !== input.actorSide) {
      return {
        ok: false,
        code: 'NOT_YOUR_TURN',
        message: 'The move does not belong to the current player turn.',
      };
    }

    let game = input.game;
    if (!game.canonicalState) {
      const synced = this.validator.syncFromWire(game, input.rules);
      if (!synced.ok) {
        return { ok: false, code: synced.code, message: synced.message };
      }
      game = synced.wire;
    }

    const validated = this.validator.validateMove({
      game,
      rules: input.rules,
      actorSide: input.actorSide,
      move: input.move,
    });
    if (!validated.ok) {
      return { ok: false, code: validated.code, message: validated.message };
    }

    const nextGame: GameSnapshot = {
      ...validated.nextWire,
      lastMove: input.move,
    };

    if (validated.finished) {
      return {
        ok: true,
        nextGame,
        finished: validated.finished,
      };
    }

    return { ok: true, nextGame };
  }
}
