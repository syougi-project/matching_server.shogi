import { resolveGamePieceCode } from '@/catalog/game-piece-code';
import { normalizePortedSkillPieceCode } from '@/catalog/ported-skill-piece-code';
import type { MoveVector, PieceDefinition, PlayerSide, RuleSnapshot } from '@/types/domain';
import { gameCode, resolveDef, type PortedPiece } from '@/game/ported-app-piece-code';

type RemainingBoard = Map<string, PortedPiece>;

/** 民 — 前後左右1マス（HTML peopleMoves / app.shogi 準拠）。 */
export const PEOPLE_ORTHOGONAL_MOVE_VECTORS: MoveVector[] = [
  { dx: -1, dy: 0, maxStep: 1 },
  { dx: 1, dy: 0, maxStep: 1 },
  { dx: 0, dy: -1, maxStep: 1 },
  { dx: 0, dy: 1, maxStep: 1 },
];

/** 味方の畑があるとき民に追加される斜め4方向1マス。 */
export const PEOPLE_FIELD_DIAGONAL_BUFF_VECTORS: MoveVector[] = [
  { dx: -1, dy: -1, maxStep: 1 },
  { dx: 1, dy: -1, maxStep: 1 },
  { dx: -1, dy: 1, maxStep: 1 },
  { dx: 1, dy: 1, maxStep: 1 },
];

export function isHousePieceCode(code: string, char?: string | null): boolean {
  const normalized = normalizePortedSkillPieceCode(code, char);
  if (normalized === 'HOUSE' || char === '家') return true;
  if (normalized === 'ZIE' || normalized.endsWith('_ZIE')) return true;
  return normalized.includes('HOUSE');
}

export function isFieldPieceCode(code: string, char?: string | null): boolean {
  const normalized = normalizePortedSkillPieceCode(code, char);
  if (normalized === 'FIELD' || char === '畑') return true;
  if (normalized === 'ZTA' || normalized.endsWith('_ZTA')) return true;
  return normalized.includes('FIELD');
}

export function isHousePiece(piece: PortedPiece, def: PieceDefinition | null): boolean {
  if (def?.char?.trim() === '家') return true;
  if (def && resolveGamePieceCode(def) === 'HOUSE') return true;
  return isHousePieceCode(piece.code, def?.char ?? null);
}

export function isFieldPiece(piece: PortedPiece, def: PieceDefinition | null): boolean {
  if (def?.char?.trim() === '畑') return true;
  if (def && resolveGamePieceCode(def) === 'FIELD') return true;
  return isFieldPieceCode(piece.code, def?.char ?? null);
}

export function isFixedHouseOrFieldPiece(piece: PortedPiece, def: PieceDefinition | null): boolean {
  return isHousePiece(piece, def) || isFieldPiece(piece, def);
}

export function isPeoplePiece(piece: PortedPiece, def: PieceDefinition | null): boolean {
  return gameCode(piece, def) === 'PEOPLE' || def?.char === '民';
}

export function isPeoplePieceCode(code: string, char?: string | null): boolean {
  const normalized = code.trim().toUpperCase();
  if (normalized === 'PEOPLE' || char === '民') return true;
  if (normalized.includes('PEOPLE') || normalized.endsWith('_ZMN')) return true;
  return false;
}

export function hasAllyFieldOnBoard(
  board: RemainingBoard,
  rules: RuleSnapshot,
  side: PlayerSide,
): boolean {
  for (const piece of board.values()) {
    if (piece.side !== side) continue;
    const def = resolveDef(rules, piece);
    if (isFieldPiece(piece, def)) return true;
  }
  return false;
}

export function adjustVectorsForHouseFieldPeople(input: {
  vectors: MoveVector[];
  board: RemainingBoard;
  rules: RuleSnapshot;
  piece: PortedPiece;
  def: PieceDefinition | null;
  actorSide: PlayerSide;
}): MoveVector[] {
  if (isHousePiece(input.piece, input.def) || isFieldPiece(input.piece, input.def)) {
    return [];
  }
  if (!isPeoplePiece(input.piece, input.def)) {
    return input.vectors;
  }
  const vectors = PEOPLE_ORTHOGONAL_MOVE_VECTORS.map((vector) => ({ ...vector }));
  if (hasAllyFieldOnBoard(input.board, input.rules, input.actorSide)) {
    vectors.push(...PEOPLE_FIELD_DIAGONAL_BUFF_VECTORS.map((vector) => ({ ...vector })));
  }
  return vectors;
}

export function peopleFieldBuffActive(
  board: RemainingBoard,
  rules: RuleSnapshot,
  side: PlayerSide,
  pieceCode: string,
  char?: string | null,
): boolean {
  if (!isPeoplePieceCode(pieceCode, char)) return false;
  return hasAllyFieldOnBoard(board, rules, side);
}
