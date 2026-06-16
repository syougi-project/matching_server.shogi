import type { MoveVector, PieceDefinition, PlayerSide, RuleSnapshot } from '@/types/domain';
import { intrinsicMoveVectorOverride } from '@/game/shop-piece-move-vectors';
import { isKing, type PortedPiece } from '@/game/ported-app-piece-code';

type SkillState = {
  board_hazards: Record<string, unknown>[];
  board_arrow_tiles: Record<string, unknown>[];
  movement_modifiers: Record<string, unknown>[];
  piece_statuses: Record<string, unknown>[];
  piece_defenses: Record<string, unknown>[];
  last_player_moved_piece?: Record<string, unknown>;
  last_enemy_moved_piece?: Record<string, unknown>;
};

export const BOOK_FALLBACK_MOVE_VECTORS: MoveVector[] = [
  { dx: 0, dy: -1, maxStep: 1 },
  { dx: 0, dy: 1, maxStep: 1 },
  { dx: -1, dy: 0, maxStep: 1 },
  { dx: 1, dy: 0, maxStep: 1 },
];

export function lastMovedPieceForBook(
  skillState: SkillState,
  bookSide: PlayerSide,
): {
  pieceCode: string | null;
  char: string;
  promoted: boolean;
  copiedMoveVectors: MoveVector[] | null;
} | null {
  const key = bookSide === 'black' ? 'last_enemy_moved_piece' : 'last_player_moved_piece';
  const raw = skillState[key];
  if (!raw || typeof raw !== 'object') return null;
  const pieceCode = typeof raw.pieceCode === 'string' ? raw.pieceCode : null;
  const char = typeof raw.char === 'string' ? raw.char : '';
  const promoted = raw.promoted === true;
  const copiedMoveVectors = Array.isArray(raw.copiedMoveVectors)
    ? (raw.copiedMoveVectors as MoveVector[])
    : null;
  if (!pieceCode && !char) return null;
  return { pieceCode, char, promoted, copiedMoveVectors };
}

function effectiveMoveVectorsForDefinition(definition: PieceDefinition): MoveVector[] {
  const intrinsic = intrinsicMoveVectorOverride(definition);
  const vectors = intrinsic ?? definition.moveVectors;
  return vectors.map((vector) => ({ ...vector }));
}

export function resolveBookMoveVectors(
  rules: RuleSnapshot,
  skillState: SkillState,
  bookSide: PlayerSide,
): MoveVector[] {
  const marker = lastMovedPieceForBook(skillState, bookSide);
  if (!marker) return BOOK_FALLBACK_MOVE_VECTORS.map((vector) => ({ ...vector }));
  if (marker.copiedMoveVectors && marker.copiedMoveVectors.length > 0) {
    return marker.copiedMoveVectors.map((vector) => ({ ...vector }));
  }
  const code = (marker.pieceCode ?? '').toUpperCase();
  const def =
    rules.piecesByCode[code] ??
    Object.values(rules.piecesByCode).find((entry) => entry.char === marker.char) ??
    null;
  if (def) {
    const vectors = effectiveMoveVectorsForDefinition(def);
    if (vectors.length > 0) return vectors;
  }
  return BOOK_FALLBACK_MOVE_VECTORS.map((vector) => ({ ...vector }));
}

export function recordLastMovedPieceForBook(
  skillState: SkillState,
  actorSide: PlayerSide,
  movedPiece: PortedPiece,
  movedDef: PieceDefinition | null,
  destination: { row: number; col: number },
): void {
  const key = actorSide === 'black' ? 'last_player_moved_piece' : 'last_enemy_moved_piece';
  const copiedMoveVectors = movedDef ? effectiveMoveVectorsForDefinition(movedDef) : [];
  (skillState as Record<string, unknown>)[key] = {
    side: actorSide,
    row: destination.row,
    col: destination.col,
    pieceCode: movedPiece.code,
    char: movedDef?.char ?? movedPiece.code,
    promoted: movedPiece.promoted,
    copiedMoveVectors,
  };
}

export function isKingLikeForBook(piece: PortedPiece, def: PieceDefinition | null): boolean {
  return isKing(piece, def);
}
