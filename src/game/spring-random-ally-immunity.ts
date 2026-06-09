import { resolveGamePieceCode } from '@/catalog/game-piece-code';
import { isSpringPieceDefinition } from '@/game/spring-ryu-awakening';
import type { PieceDefinition, PlayerSide, RuleSnapshot } from '@/types/domain';

export const SPRING_ALLY_IMMUNITY_TURNS = 5;

type BoardPiece = {
  side: PlayerSide;
  code: string;
  promoted: boolean;
};

type SkillStateLike = {
  piece_defenses: Record<string, unknown>[];
};

function resolveDefinition(rules: RuleSnapshot, code: string): PieceDefinition | null {
  const upper = code.trim().toUpperCase();
  return (
    rules.piecesByCode[upper] ??
    Object.values(rules.piecesByCode).find((def) => def.pieceCode.toUpperCase() === upper) ??
    null
  );
}

function isSpringBoardPiece(rules: RuleSnapshot, piece: BoardPiece): boolean {
  if (piece.code.toUpperCase() === 'SPRING') return true;
  const definition = resolveDefinition(rules, piece.code);
  return definition ? isSpringPieceDefinition(definition) : false;
}

export function upsertCaptureImmunityDefense(
  skillState: SkillStateLike,
  side: PlayerSide,
  row: number,
  col: number,
  remainingTurns: number,
) {
  const existing = skillState.piece_defenses.find(
    (entry) =>
      String(entry.side ?? '') === side &&
      Number(entry.row) === row &&
      Number(entry.col) === col &&
      String(entry.mode ?? '') === 'immunity',
  );
  if (existing) {
    const current = Number(existing.remaining_turns ?? existing.remainingTurns ?? 0);
    existing.remaining_turns = Math.max(current, remainingTurns);
    return;
  }
  skillState.piece_defenses.push({
    row,
    col,
    side,
    mode: 'immunity',
    remaining_turns: remainingTurns,
  });
}

export function listSpringImmunityCandidateSquares(
  board: Iterable<readonly [string, BoardPiece]>,
  rules: RuleSnapshot,
  actorSide: PlayerSide,
  excludeSquare: string,
  parseSquare: (square: string) => { row: number; col: number },
): Array<{ square: string; row: number; col: number }> {
  const candidates: Array<{ square: string; row: number; col: number }> = [];
  for (const [square, piece] of board) {
    if (piece.side !== actorSide) continue;
    if (square === excludeSquare) continue;
    if (isSpringBoardPiece(rules, piece)) continue;
    if (piece.code.toUpperCase() === 'X') continue;
    const definition = resolveDefinition(rules, piece.code);
    if (definition?.char.trim() === 'X') continue;
    const { row, col } = parseSquare(square);
    candidates.push({ square, row, col });
  }
  candidates.sort((a, b) => a.square.localeCompare(b.square));
  return candidates;
}

export function grantRandomAllySpringImmunity(input: {
  board: Iterable<readonly [string, BoardPiece]>;
  skillState: SkillStateLike;
  rules: RuleSnapshot;
  actorSide: PlayerSide;
  excludeSquare: string;
  parseSquare: (square: string) => { row: number; col: number };
  pickRandom: <T>(items: readonly T[]) => T | null;
}): boolean {
  const candidates = listSpringImmunityCandidateSquares(
    input.board,
    input.rules,
    input.actorSide,
    input.excludeSquare,
    input.parseSquare,
  );
  const target = input.pickRandom(candidates);
  if (!target) return false;
  upsertCaptureImmunityDefense(
    input.skillState,
    input.actorSide,
    target.row,
    target.col,
    SPRING_ALLY_IMMUNITY_TURNS,
  );
  return true;
}
