import { resolveGamePieceCode, resolveGamePieceCodeFromRules } from '@/catalog/game-piece-code';
import type { PlayerSide, RuleSnapshot } from '@/types/domain';

type InternalPiece = {
  side: PlayerSide;
  code: string;
  promoted: boolean;
};

type InternalBoard = Map<string, InternalPiece>;

type InternalHands = Record<PlayerSide, Record<string, number>>;

type NormalizedMove = {
  from: string | null;
  to: string;
  piece: string;
  promote: boolean;
  drop: boolean;
};

const NAKU_PON_CAPTURE_MAX = 3;

export function isNakuPiece(piece: InternalPiece, rules: RuleSnapshot): boolean {
  const definition = rules.piecesByCode[piece.code] ?? null;
  if (definition?.char.trim() === '鳴') return true;
  const code = piece.code.trim().toUpperCase();
  if (code === 'NAKU' || code === 'SHOP_NAKU') return true;
  if (code.includes('PIECE_SHOP_NAKU') || code.includes('SHOP_NAKU')) return true;
  if (definition) {
    const gameCode = resolveGamePieceCode(definition);
    if (gameCode === 'NAKU' || gameCode === 'SHOP_NAKU') return true;
  }
  return false;
}

export function isSameEnemyPieceTypeForNakuPon(
  rules: RuleSnapshot,
  a: InternalPiece,
  b: InternalPiece,
): boolean {
  const codeA = resolveGamePieceCodeFromRules(rules, a.code) ?? a.code.trim().toUpperCase();
  const codeB = resolveGamePieceCodeFromRules(rules, b.code) ?? b.code.trim().toUpperCase();
  if (codeA === codeB) return true;
  const defA = rules.piecesByCode[a.code];
  const defB = rules.piecesByCode[b.code];
  const charA = defA?.char.trim() ?? '';
  const charB = defB?.char.trim() ?? '';
  return charA.length > 0 && charA === charB;
}

/** 鳴: 敵を取ったとき、同種の敵駒が盤面に2体以上あれば合計3体までまとめて取る。 */
export function applyNakuPonCaptures(input: {
  rules: RuleSnapshot;
  boardBeforeMove: InternalBoard;
  board: InternalBoard;
  hands: InternalHands;
  actorSide: PlayerSide;
  movedPiece: InternalPiece;
  move: NormalizedMove;
  capturedPiece: InternalPiece;
  capturedToHandCode: (piece: InternalPiece) => string;
  incrementHand: (side: PlayerSide, pieceCode: string) => void;
}): boolean {
  if (input.move.drop) return false;
  if (!isNakuPiece(input.movedPiece, input.rules)) return false;
  if (input.capturedPiece.code === 'OU') return false;

  const enemySide: PlayerSide = input.actorSide === 'black' ? 'white' : 'black';
  const sameTypeSquares: string[] = [];
  for (const [square, piece] of input.boardBeforeMove.entries()) {
    if (piece.side !== enemySide) continue;
    if (!isSameEnemyPieceTypeForNakuPon(input.rules, piece, input.capturedPiece)) continue;
    sameTypeSquares.push(square);
  }
  if (sameTypeSquares.length < 2) return false;

  const targetTotal = Math.min(sameTypeSquares.length, NAKU_PON_CAPTURE_MAX);
  const extras = sameTypeSquares
    .filter((square) => square !== input.move.to)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, targetTotal - 1);

  let swept = false;
  for (const square of extras) {
    const victim = input.board.get(square);
    if (!victim || victim.side !== enemySide) continue;
    if (victim.code === 'OU') continue;
    input.board.delete(square);
    input.incrementHand(input.actorSide, input.capturedToHandCode(victim));
    swept = true;
  }
  return swept;
}
