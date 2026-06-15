import { resolveGamePieceCode } from '@/catalog/game-piece-code';
import type { PieceDefinition, PlayerSide, RuleSnapshot } from '@/types/domain';

type BoardPiece = {
  side: PlayerSide;
  code: string;
  promoted: boolean;
};

/** 小竜（覚醒前）— 斜め何マスでも + 縦横1（HTML dragonMoves）。 */
export const RYU_DRAGON_MOVE_VECTORS: PieceDefinition['moveVectors'] = [
  { dx: -1, dy: -1, maxStep: 8 },
  { dx: 0, dy: -1, maxStep: 1 },
  { dx: 1, dy: -1, maxStep: 8 },
  { dx: -1, dy: 0, maxStep: 1 },
  { dx: 1, dy: 0, maxStep: 1 },
  { dx: -1, dy: 1, maxStep: 8 },
  { dx: 0, dy: 1, maxStep: 1 },
  { dx: 1, dy: 1, maxStep: 8 },
];

/** 辰（覚醒後）— 全方位3マス（BFF dragonAwakened）。 */
export const TATSU_DRAGON_AWAKENED_MOVE_VECTORS: PieceDefinition['moveVectors'] = [
  { dx: -1, dy: -1, maxStep: 3 },
  { dx: 0, dy: -1, maxStep: 3 },
  { dx: 1, dy: -1, maxStep: 3 },
  { dx: -1, dy: 0, maxStep: 3 },
  { dx: 1, dy: 0, maxStep: 3 },
  { dx: -1, dy: 1, maxStep: 3 },
  { dx: 0, dy: 1, maxStep: 3 },
  { dx: 1, dy: 1, maxStep: 3 },
];

/** 泉 — 前後左右1マス。 */
export const SPRING_MOVE_VECTORS: PieceDefinition['moveVectors'] = [
  { dx: 0, dy: -1, maxStep: 1 },
  { dx: 0, dy: 1, maxStep: 1 },
  { dx: -1, dy: 0, maxStep: 1 },
  { dx: 1, dy: 0, maxStep: 1 },
];

function resolveDefinition(rules: RuleSnapshot, piece: BoardPiece): PieceDefinition | null {
  return (
    rules.piecesByCode[piece.code] ??
    Object.values(rules.piecesByCode).find((def) => def.pieceCode.toUpperCase() === piece.code) ??
    null
  );
}

function gameCodeForDefinition(definition: PieceDefinition): string {
  return resolveGamePieceCode(definition);
}

export function isSpringPieceDefinition(definition: PieceDefinition): boolean {
  const gameCode = gameCodeForDefinition(definition);
  return gameCode === 'SPRING' || definition.char.trim() === '泉';
}

export function isUnpromotedSmallDragonPiece(
  piece: BoardPiece,
  definition: PieceDefinition | null,
): boolean {
  if (piece.promoted) return false;
  if (definition?.char.trim() === '竜') return true;
  const gameCode = definition ? gameCodeForDefinition(definition) : piece.code.toUpperCase();
  return gameCode === 'RYU';
}

export function hasAllySpringOnBoard(
  board: Iterable<BoardPiece>,
  rules: RuleSnapshot,
  side: PlayerSide,
): boolean {
  for (const piece of board) {
    if (piece.side !== side) continue;
    const definition = resolveDefinition(rules, piece);
    if (definition && isSpringPieceDefinition(definition)) return true;
    if (piece.code.toUpperCase() === 'SPRING') return true;
  }
  return false;
}

function findTatsuDefinition(rules: RuleSnapshot): PieceDefinition | null {
  const direct = rules.piecesByCode.TATSU;
  if (direct) return direct;
  return Object.values(rules.piecesByCode).find((def) => {
    const gameCode = gameCodeForDefinition(def);
    return gameCode === 'TATSU' || def.char.trim() === '辰';
  }) ?? null;
}

/** 合法手生成: 味方に泉がある間、小竜を辰の定義で動かす。 */
export function resolveEffectivePieceDefinition(
  rules: RuleSnapshot,
  board: Iterable<BoardPiece>,
  piece: BoardPiece,
): PieceDefinition | null {
  const definition = resolveDefinition(rules, piece);
  if (!definition) return null;
  if (!hasAllySpringOnBoard(board, rules, piece.side)) return definition;
  if (!isUnpromotedSmallDragonPiece(piece, definition)) return definition;
  return findTatsuDefinition(rules) ?? definition;
}

/** スキル判定: 覚醒中の小竜移動は辰スキルとして扱う。 */
export function effectiveMovedSkillCode(
  rules: RuleSnapshot,
  board: Iterable<BoardPiece>,
  movedPiece: BoardPiece,
  definition: PieceDefinition | null,
  normalizedCode: string,
): string {
  if (
    normalizedCode === 'RYU' &&
    hasAllySpringOnBoard(board, rules, movedPiece.side) &&
    isUnpromotedSmallDragonPiece(movedPiece, definition)
  ) {
    return 'TATSU';
  }
  return normalizedCode;
}
