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

/** 月: TURN（着手時点の turnNumber = moveCount + 1）を 4 で割った余りが 0 または 1 のとき全方位 1 マス、2 または 3 のとき全方位 2 マス */
export function moonMaxStep(turnNumber: number): number {
  const phase = ((Math.max(1, Math.floor(turnNumber)) % 4) + 4) % 4;
  return phase === 2 || phase === 3 ? 2 : 1;
}

export function adjustVectorsForMoon(
  vectors: MoveVector[],
  piece: PortedPiece,
  def: PieceDefinition | null,
  turnNumber: number,
): MoveVector[] {
  if (!isMoon(piece, def)) return vectors;
  const maxStep = moonMaxStep(turnNumber);
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
  const r1Valid = r1 >= 0 && r1 <= 8;
  const r2Valid = r2 >= 0 && r2 <= 8;
  const p1 = r1Valid ? input.board.get(input.formatSquare(r1, fromCol)) ?? null : null;
  const p2 = r2Valid ? input.board.get(input.formatSquare(r2, fromCol)) ?? null : null;

  if (p1 && isFullyBlockingAlly(p1, input.piece, input.rules)) {
    // blocked
  } else if (r2Valid && p2 && p2.side === input.actorSide) {
    // blocked by ally on destination
  } else if (r1Valid && p1 && p1.side !== input.actorSide) {
    if (r2Valid) tryAdd(r2, fromCol);
  } else if (!p1) {
    tryAdd(r1, fromCol);
    if (r2Valid && p2 && p2.side !== input.actorSide && input.canCaptureTarget(p2, resolveDef(input.rules, p2))) {
      tryAdd(r2, fromCol);
    } else if (r2Valid && !p2) {
      tryAdd(r2, fromCol);
    }
  } else if (r1Valid && p1) {
    if (r2Valid) tryAdd(r2, fromCol);
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

export function computeGunPenetrationMidpoint(
  actorSide: PlayerSide,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
): Square | null {
  const dr = toRow - fromRow;
  const dc = toCol - fromCol;
  if (fromCol === toCol) {
    const d = actorSide === 'black' ? -1 : 1;
    if (dr === 2 * d) return { row: fromRow + d, col: fromCol };
  }
  if (Math.abs(dr) === 2 && Math.abs(dc) === 2 && Math.abs(dr) === Math.abs(dc)) {
    const sr = dr / 2;
    const sc = dc / 2;
    if (actorSide === 'black' && sr === 1 && Math.abs(sc) === 1) {
      return { row: fromRow + sr, col: fromCol + sc };
    }
    if (actorSide === 'white' && sr === -1 && Math.abs(sc) === 1) {
      return { row: fromRow + sr, col: fromCol + sc };
    }
  }
  return null;
}

export function applyGunPenetrationMidCapture(input: {
  board: InternalBoard;
  rules: RuleSnapshot;
  hands: Record<PlayerSide, Record<string, number>>;
  actorSide: PlayerSide;
  movedPiece: PortedPiece;
  fromSquare: string;
  toSquare: string;
  formatSquare: (row: number, col: number) => string;
  parseSquare: (square: string) => Square;
  capturedToHandCode: (piece: PortedPiece) => string;
  incrementHand: (side: PlayerSide, code: string) => void;
}): boolean {
  const from = input.parseSquare(input.fromSquare);
  const to = input.parseSquare(input.toSquare);
  const mid = computeGunPenetrationMidpoint(input.actorSide, from.row, from.col, to.row, to.col);
  if (!mid) return false;
  const midSquare = input.formatSquare(mid.row, mid.col);
  const midPiece = input.board.get(midSquare);
  if (!midPiece) return false;
  if (midPiece.side === input.actorSide) {
    if (isFullyBlockingAlly(midPiece, input.movedPiece, input.rules)) return false;
    input.board.delete(midSquare);
    return true;
  }
  const midDef = resolveDef(input.rules, midPiece);
  if (!canCaptureTarget({
    board: input.board,
    rules: input.rules,
    actorSide: input.actorSide,
    mover: input.movedPiece,
    moverDef: resolveDef(input.rules, input.movedPiece),
    target: midPiece,
    targetDef: midDef,
  })) {
    return false;
  }
  input.board.delete(midSquare);
  if (midPiece.code !== 'OU') {
    input.incrementHand(input.actorSide, input.capturedToHandCode(midPiece));
  }
  return true;
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
