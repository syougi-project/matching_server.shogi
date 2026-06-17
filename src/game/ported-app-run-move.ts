import type { PieceDefinition, PlayerSide, RuleSnapshot } from '@/types/domain';
import { hasSoulOnBoard, isArmor, isKing, isRun, resolveDef, type PortedPiece } from '@/game/ported-app-piece-code';
import { isGiant } from '@/game/ported-app-remaining-pieces';

type InternalBoard = Map<string, PortedPiece>;
type Square = { row: number; col: number };

function runForwardRowDelta(side: PlayerSide): number {
  return side === 'black' ? -1 : 1;
}

/** 走: 前方1マス（移動・取り）。1マス目が空のときのみ前方2マス目へ（app legal-moves 準拠）。 */
export function generateRunForwardTargets(input: {
  board: InternalBoard;
  rules: RuleSnapshot;
  actorSide: PlayerSide;
  from: Square;
  piece: PortedPiece;
  def: PieceDefinition | null;
  formatSquare: (row: number, col: number) => string;
}): Square[] {
  if (!isRun(input.piece, input.def)) return [];

  const d = runForwardRowDelta(input.actorSide);
  const fromRow = input.from.row;
  const fromCol = input.from.col;
  const r1 = fromRow + d;
  const r2 = fromRow + 2 * d;
  const out: Square[] = [];
  const seen = new Set<string>();

  const push = (row: number, col: number) => {
    const key = `${row}:${col}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ row, col });
  };

  const canLandOn = (occupant: PortedPiece | undefined): boolean => {
    if (!occupant) return true;
    if (occupant.side === input.actorSide) return false;
    const def = resolveDef(input.rules, occupant);
    if (isArmor(occupant, def)) return false;
    if (isKing(occupant, def) && hasSoulOnBoard(input.board, input.rules, occupant.side)) {
      return false;
    }
    if (isGiant(occupant, def)) return false;
    return true;
  };

  if (r1 < 0 || r1 > 8) return out;

  const square1 = input.formatSquare(r1, fromCol);
  const p1 = input.board.get(square1);
  if (canLandOn(p1)) push(r1, fromCol);

  if (!p1 && r2 >= 0 && r2 <= 8) {
    const square2 = input.formatSquare(r2, fromCol);
    const p2 = input.board.get(square2);
    if (canLandOn(p2)) push(r2, fromCol);
  }

  return out;
}
