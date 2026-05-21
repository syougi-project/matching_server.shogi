import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { MatchingCanonicalState } from '@/types/canonical-state';
import type { GameSnapshot, MovePayload, PieceDefinition, PlayerSide, RuleSnapshot } from '@/types/domain';

export type AppShogiPieceCatalogItem = {
  pieceCode: string;
  char: string;
  name: string;
  unlock: string;
  desc: string;
  skill: string;
  move: string;
  moveVectors: PieceDefinition['moveVectors'];
  isRepeatable: boolean;
  canJump?: boolean;
  moveConstraints?: Record<string, unknown> | null;
  moveRules?: PieceDefinition['moveRules'];
  skillDefinitionsV2?: PieceDefinition['skillDefinitionsV2'];
};

type SyncResult =
  | { ok: true; wire: GameSnapshot & { canonicalState: MatchingCanonicalState } }
  | { ok: false; code: string; message: string };

type ValidateResult =
  | {
      ok: true;
      nextWire: GameSnapshot & { canonicalState: MatchingCanonicalState };
      finished?: { winnerSide: PlayerSide; reason: 'checkmate' | 'king_capture' };
    }
  | { ok: false; code: string; message: string };

export function ruleSnapshotToPieceCatalog(rules: RuleSnapshot): AppShogiPieceCatalogItem[] {
  return Object.values(rules.piecesByCode).map((piece) => ({
    pieceCode: piece.pieceCode,
    char: piece.char,
    name: piece.name,
    unlock: 'online',
    desc: piece.skill,
    skill: piece.skill,
    move: piece.name,
    moveVectors: piece.moveVectors,
    isRepeatable: false,
    canJump: piece.canJump,
    moveConstraints: piece.moveConstraints,
    moveRules: piece.moveRules,
    skillDefinitionsV2: piece.skillDefinitionsV2,
  }));
}

export function gameSnapshotToWire(game: GameSnapshot): {
  version: number;
  turn: PlayerSide;
  board: Record<string, string>;
  hands: Record<PlayerSide, Record<string, number>>;
} {
  return {
    version: game.version,
    turn: game.turn,
    board: game.boardState,
    hands: game.handsState,
  };
}

export class AppShogiValidatorClient {
  constructor(private readonly appShogiRoot: string) {}

  syncFromWire(
    game: GameSnapshot,
    rules: RuleSnapshot,
  ): SyncResult {
    const payload = {
      op: 'sync' as const,
      wire: gameSnapshotToWire(game),
      pieceCatalog: ruleSnapshotToPieceCatalog(rules),
    };
    const raw = this.invoke(payload);
    if (!raw.ok) {
      return { ok: false, code: raw.code ?? 'SYNC_FAILED', message: raw.message ?? 'sync failed' };
    }
    if (!('wire' in raw) || !raw.wire) {
      return { ok: false, code: 'SYNC_FAILED', message: 'sync response missing wire' };
    }
    return { ok: true, wire: wireToGameSnapshot(raw.wire, game) };
  }

  validateMove(input: {
    game: GameSnapshot;
    rules: RuleSnapshot;
    actorSide: PlayerSide;
    move: MovePayload;
  }): ValidateResult {
    const canonical = input.game.canonicalState;
    if (!canonical) {
      return { ok: false, code: 'MISSING_CANONICAL_STATE', message: 'canonical state is not initialized' };
    }

    const payload = {
      position: canonical,
      pieceCatalog: ruleSnapshotToPieceCatalog(input.rules),
      movePayload: input.move,
      actorRole: input.actorSide,
    };
    const raw = this.invoke(payload);
    if (!raw.ok) {
      return { ok: false, code: raw.code ?? 'VALIDATION_FAILED', message: raw.message ?? 'validation failed' };
    }
    if (!('nextWire' in raw) || !raw.nextWire) {
      return { ok: false, code: 'VALIDATION_FAILED', message: 'validation response missing nextWire' };
    }

    const nextGame = wireToGameSnapshot(raw.nextWire, input.game);
    nextGame.lastMove = input.move;
    nextGame.lastSkillTriggered = raw.skillTriggered === true;

    const finished =
      raw.game?.status === 'finished' && raw.game.winnerSide
        ? {
            winnerSide: canonicalWinnerToServer(raw.game.winnerSide),
            reason: 'king_capture' as const,
          }
        : undefined;

    return { ok: true, nextWire: nextGame, finished };
  }

  private invoke(payload: Record<string, unknown>): Record<string, any> {
    const bundled = resolve(this.appShogiRoot, 'dist/online-move-validator.js');
    const scriptPath = existsSync(bundled)
      ? bundled
      : resolve(this.appShogiRoot, 'scripts/online-move-validator.ts');
    const proc = Bun.spawnSync(['bun', scriptPath], {
      cwd: this.appShogiRoot,
      stdin: new TextEncoder().encode(JSON.stringify(payload)),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const text = new TextDecoder().decode(proc.stdout);
    const stderr = new TextDecoder().decode(proc.stderr);
    if (proc.exitCode !== 0) {
      throw new Error(
        `app.shogi validator failed (exit ${proc.exitCode}): ${stderr.trim() || text.trim() || 'unknown'}`,
      );
    }
    return JSON.parse(text.trim()) as Record<string, any>;
  }
}

function wireToGameSnapshot(
  wire: {
    version: number;
    turn: PlayerSide;
    board: Record<string, string>;
    hands: Record<PlayerSide, Record<string, number>>;
    canonicalState?: MatchingCanonicalState;
  },
  previous: GameSnapshot,
): GameSnapshot & { canonicalState: MatchingCanonicalState } {
  if (!wire.canonicalState) {
    throw new Error('wire response missing canonicalState');
  }
  return {
    boardState: wire.board,
    handsState: wire.hands,
    turn: wire.turn,
    moveCount: previous.moveCount + 1,
    version: wire.version,
    lastMove: previous.lastMove,
    canonicalState: wire.canonicalState,
  };
}

function canonicalWinnerToServer(winner: 'player' | 'enemy'): PlayerSide {
  return winner === 'player' ? 'black' : 'white';
}
