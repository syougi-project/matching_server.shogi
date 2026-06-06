import type { PieceDefinition } from '@/types/domain';
import { PORTED_APP_SKILL_CODES } from '@/game/ported-app-skill-codes';
import {
  resolveGachaGamePieceCode,
} from '@/catalog/gacha-skill-piece-code';
import {
  normalizePortedSkillPieceCode,
  resolvePortedGamePieceCode,
} from '@/catalog/ported-skill-piece-code';

const PORTED_SKILL_CODE_SET = new Set<string>(PORTED_APP_SKILL_CODES);

const STANDARD_CANONICAL_TO_GAME_CODE: Record<string, string> = {
  PAWN: 'FU',
  LANCE: 'KY',
  KNIGHT: 'KE',
  SILVER: 'GI',
  GOLD: 'KI',
  BISHOP: 'KA',
  ROOK: 'HI',
  KING: 'OU',
};

const STANDARD_SFEN_TO_GAME_CODE: Record<string, string> = {
  P: 'FU',
  L: 'KY',
  N: 'KE',
  S: 'GI',
  G: 'KI',
  B: 'KA',
  R: 'HI',
  K: 'OU',
};

const STANDARD_CHAR_TO_GAME_CODE: Record<string, string> = {
  歩: 'FU',
  香: 'KY',
  桂: 'KE',
  銀: 'GI',
  金: 'KI',
  角: 'KA',
  飛: 'HI',
  王: 'OU',
  玉: 'OU',
  と: 'TO',
  成香: 'NY',
  成桂: 'NK',
  成銀: 'NG',
  馬: 'UM',
  龍: 'RY',
  竜: 'RY',
};

const PROMOTED_STANDARD_CODE: Record<string, string> = {
  FU: 'TO',
  KY: 'NY',
  KE: 'NK',
  GI: 'NG',
  KA: 'UM',
  HI: 'RY',
};

/** BFF/DB の instance id (PIECE_<hex>) を含む定義から、対局で使うゲームコードを決める */
export function resolveGamePieceCode(piece: PieceDefinition): string {
  const canonical = piece.canonicalCode.trim().toUpperCase();
  const byCanonical = STANDARD_CANONICAL_TO_GAME_CODE[canonical];
  if (byCanonical) return byCanonical;

  const sfen = piece.sfenCode?.trim().toUpperCase();
  if (sfen) {
    const bySfen = STANDARD_SFEN_TO_GAME_CODE[sfen.replace(/^\+/, '')];
    if (bySfen) return piece.isPromoted ? (PROMOTED_STANDARD_CODE[bySfen] ?? bySfen) : bySfen;
  }

  const byChar = STANDARD_CHAR_TO_GAME_CODE[piece.char.trim()];
  if (byChar) return piece.isPromoted ? (PROMOTED_STANDARD_CODE[byChar] ?? byChar) : byChar;

  const gachaCode = resolveGachaGamePieceCode(piece.char, piece.pieceCode);
  if (gachaCode) return gachaCode;

  const portedCode = resolvePortedGamePieceCode(piece.char, piece.pieceCode);
  if (portedCode) return portedCode;

  const normalized = normalizePortedSkillPieceCode(piece.pieceCode, piece.char);
  if (normalized !== piece.pieceCode.trim().toUpperCase() && PORTED_SKILL_CODE_SET.has(normalized)) {
    return normalized;
  }

  return piece.pieceCode.trim().toUpperCase();
}

export function resolveGamePieceCodeFromRules(
  rules: { piecesByCode: Record<string, PieceDefinition> },
  rawCode: string,
): string | null {
  const upper = rawCode.trim().toUpperCase();
  const direct = rules.piecesByCode[upper];
  if (direct) return resolveGamePieceCode(direct);

  for (const piece of Object.values(rules.piecesByCode)) {
    if (piece.pieceCode.toUpperCase() === upper) return resolveGamePieceCode(piece);
    if (piece.sfenCode?.trim().toUpperCase() === upper) return resolveGamePieceCode(piece);
    if (piece.canonicalCode?.trim().toUpperCase() === upper) return resolveGamePieceCode(piece);
    if (piece.char.trim().toUpperCase() === upper) return resolveGamePieceCode(piece);
  }

  return null;
}
