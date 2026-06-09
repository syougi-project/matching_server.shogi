import type { MoveVector, PieceDefinition, PlayerSide, RuleSnapshot } from '@/types/domain';
import {
  hasSoulOnBoard,
  isArmor,
  isGun,
  isHeart,
  isKatana,
  isKing,
  isMoon,
  isSatori,
  resolveDef,
  type PortedPiece,
} from '@/game/ported-app-piece-code';

type InternalBoard = Map<string, PortedPiece>;
type Square = { row: number; col: number };

export type Stage19NormalizedMove = {
  from: string | null;
  to: string;
  piece: string;
  promote: boolean;
  drop: boolean;
  notation: string | null;
};

export function moonMaxStep(moveCount: number): number {
  const phase = ((moveCount % 4) + 4) % 4;
  return phase === 2 || phase === 3 ? 2 : 1;
}

export function adjustVectorsForMoon(
  vectors: MoveVector[],
  piece: PortedPiece,
  def: PieceDefinition | null,
  moveCount: number,
): MoveVector[] {
  if (!isMoon(piece, def)) return vectors;
  const maxStep = moonMaxStep(moveCount);
  return [
    { dx: -1, dy: -1, maxStep },
    { dx: 0, dy: -1, maxStep },
    { dx: 1, dy: -1, maxStep },
    { dx: -1, dy: 0, maxStep },
    { dx: 1, dy: 0, maxStep },
    { dx: -1, dy: 1, maxStep },
    { dx: 0, dy: 1, maxStep },
    { dx: 1, dy: 1, maxStep },
  ];
}

export function canCaptureTarget(input: {
  board: InternalBoard;
  rules: RuleSnapshot;
  actorSide: PlayerSide;
  mover: PortedPiece;
  moverDef: PieceDefinition | null;
  target: PortedPiece;
  targetDef: PieceDefinition | null;
}): boolean {
  if (input.target.side === input.actorSide) return true;
  if (isArmor(input.mover, input.moverDef)) return false;
  if (isArmor(input.target, input.targetDef)) return false;
  if (
    isKing(input.target, input.targetDef) &&
    hasSoulOnBoard(input.board, input.rules, input.target.side)
  ) {
    return false;
  }
  return true;
}

export function filterKatanaTargets(input: {
  board: InternalBoard;
  rules: RuleSnapshot;
  actorSide: PlayerSide;
  from: Square;
  targets: Square[];
  piece: PortedPiece;
  def: PieceDefinition | null;
}): Square[] {
  if (!isKatana(input.piece, input.def)) return input.targets;
  const forwardDr = input.actorSide === 'black' ? -1 : 1;
  return input.targets.filter((target) => {
    return target.col === input.from.col && target.row === input.from.row + forwardDr;
  });
}

export function generateGunTargets(input: {
  board: InternalBoard;
  rules: RuleSnapshot;
  actorSide: PlayerSide;
  from: Square;
  piece: PortedPiece;
  def: PieceDefinition | null;
  formatSquare: (row: number, col: number) => string;
  canCaptureTarget: (target: PortedPiece, targetDef: PieceDefinition | null) => boolean;
}): Square[] {
  if (!isGun(input.piece, input.def)) return [];
  const out: Square[] = [];
  const seen = new Set<string>();
  const d = input.actorSide === 'black' ? -1 : 1;
  const { row: fromRow, col: fromCol } = input.from;

  const tryAdd = (row: number, col: number) => {
    if (row < 0 || row > 8 || col < 0 || col > 8) return;
    const key = `${row}:${col}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ row, col });
  };

  const r1 = fromRow + d;
  const r2 = fromRow + 2 * d;
  const p1 = r1 >= 0 && r1 <= 8 ? input.board.get(input.formatSquare(r1, fromCol)) : null;
  const p2 = r2 >= 0 && r2 <= 8 ? input.board.get(input.formatSquare(r2, fromCol)) : null;
  if (p1 && isFullyBlockingAlly(p1, input.piece, input.rules)) {
    // blocked
  } else if (p1 && p1.side !== input.actorSide && input.canCaptureTarget(p1, resolveDef(input.rules, p1))) {
    tryAdd(r1, fromCol);
  } else if (!p1) {
    tryAdd(r1, fromCol);
    if (p2 && p2.side !== input.actorSide && input.canCaptureTarget(p2, resolveDef(input.rules, p2))) {
      tryAdd(r2, fromCol);
    } else if (!p2) {
      tryAdd(r2, fromCol);
    }
  }

  for (const [dr, dc] of [
    [2, -2],
    [2, 2],
  ] as const) {
    const backDr = input.actorSide === 'black' ? dr : -dr;
    const midRow = fromRow + backDr / 2;
    const midCol = fromCol + dc / 2;
    const toRow = fromRow + backDr;
    const toCol = fromCol + dc;
    if (toRow < 0 || toRow > 8 || toCol < 0 || toCol > 8) continue;
    const mid = input.board.get(input.formatSquare(midRow, midCol));
    const dest = input.board.get(input.formatSquare(toRow, toCol));
    if (mid && mid.side === input.actorSide && isFullyBlockingAlly(mid, input.piece, input.rules)) continue;
    if (dest && dest.side === input.actorSide) continue;
    if (dest && !input.canCaptureTarget(dest, resolveDef(input.rules, dest))) continue;
    if (mid && mid.side !== input.actorSide) {
      tryAdd(toRow, toCol);
    } else if (!mid && !dest) {
      tryAdd(toRow, toCol);
    }
  }

  return out;
}

function isFullyBlockingAlly(piece: PortedPiece, gun: PortedPiece, rules: RuleSnapshot): boolean {
  if (piece.side !== gun.side) return false;
  const def = resolveDef(rules, piece);
  return isKing(piece, def) || isArmor(piece, def) || piece.code === 'KBOSS' || def?.char === 'K';
}

export function generateSatoriHeartNotationMoves(input: {
  board: InternalBoard;
  rules: RuleSnapshot;
  side: PlayerSide;
  baseMoves: Stage19NormalizedMove[];
  formatSquare: (row: number, col: number) => string;
  parseSquare: (square: string) => Square;
}): Stage19NormalizedMove[] {
  const extra: Stage19NormalizedMove[] = [];
  for (const move of input.baseMoves) {
    if (move.drop || !move.from) continue;
    const piece = input.board.get(move.from);
    if (!piece || piece.side !== input.side) continue;
    const def = resolveDef(input.rules, piece);
    const dest = input.parseSquare(move.to);

    if (isSatori(piece, def)) {
      for (const [square, target] of input.board.entries()) {
        if (target.side === input.side || target.code === 'OU') continue;
        const pos = input.parseSquare(square);
        extra.push({
          ...move,
          notation: `satori_stun:${pos.row}:${pos.col}`,
        });
      }
    }
    if (isHeart(piece, def)) {
      for (const [square, target] of input.board.entries()) {
        if (target.side !== input.side || target.code === 'OU') continue;
        const pos = input.parseSquare(square);
        extra.push({
          ...move,
          notation: `heart_protect:${pos.row}:${pos.col}`,
        });
      }
    }
  }
  return extra;
}

export function isSealImmobilized(
  skillState: { piece_statuses: Record<string, unknown>[] },
  piece: PortedPiece,
  square: Square,
): boolean {
  return skillState.piece_statuses.some((entry) => {
    const statusType = String(entry.status_type ?? entry.statusType ?? '');
    if (statusType !== 'seal_immobilize' && statusType !== 'stun') return false;
    const rem = Number(entry.remaining_turns ?? entry.remainingTurns ?? 0);
    if (rem <= 0) return false;
    return (
      String(entry.side ?? 'black') === piece.side &&
      Number(entry.row) === square.row &&
      Number(entry.col) === square.col
    );
  });
}
