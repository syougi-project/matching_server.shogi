import { PORTED_APP_SKILL_CODES } from '@/game/ported-app-skill-codes';

const PORTED_SKILL_CODE_SET = new Set<string>(PORTED_APP_SKILL_CODES);

/** ガチャ駒の漢字 → matching_server スキル判定用コード */
const GACHA_CHAR_TO_SKILL_CODE: Readonly<Record<string, string>> = {
  爆: 'GACHA_BAKU',
  室: 'GACHA_SHITSU',
  定: 'GACHA_SADAME',
  安: 'GACHA_AN',
  宋: 'GACHA_SO',
  灯: 'GACHA_TOU',
  辺: 'GACHA_HEN',
  逸: 'GACHA_ITSU',
  逃: 'GACHA_TOU2',
  艸: 'GACHA_SOU',
  膠: 'GACHA_KOU',
  煽: 'GACHA_AORI',
};

/** BFF / 旧クライアントの pieceCode 別名 */
const EXPLICIT_GACHA_CODE_ALIASES: Readonly<Record<string, string>> = {
  PIECE_GACHA_KO: 'GACHA_KOU',
  PIECE_GACHA_KOU: 'GACHA_KOU',
  GACHA_KO: 'GACHA_KOU',
  PIECE_GACHA_MURO: 'GACHA_SHITSU',
  PIECE_GACHA_SHITSU: 'GACHA_SHITSU',
  GACHA_MURO: 'GACHA_SHITSU',
  PIECE_GACHA_TO: 'GACHA_TOU2',
  GACHA_TO: 'GACHA_TOU2',
  PIECE_GACHA_BAKU: 'GACHA_BAKU',
  PIECE_GACHA_SADAME: 'GACHA_SADAME',
  PIECE_GACHA_AN: 'GACHA_AN',
  PIECE_GACHA_SO: 'GACHA_SO',
  PIECE_GACHA_TOU: 'GACHA_TOU',
  PIECE_GACHA_HEN: 'GACHA_HEN',
  PIECE_GACHA_ITSU: 'GACHA_ITSU',
  PIECE_GACHA_TOU2: 'GACHA_TOU2',
  PIECE_GACHA_SOU: 'GACHA_SOU',
  PIECE_GACHA_AORI: 'GACHA_AORI',
  GACHA_AORI: 'GACHA_AORI',
};

function gachaSuffixToSkillCode(suffix: string): string | null {
  const upper = suffix.trim().toUpperCase();
  const remapped =
    upper === 'KO'
      ? 'KOU'
      : upper === 'MURO'
        ? 'SHITSU'
        : upper === 'TO'
          ? 'TOU2'
          : upper;
  const candidate = `GACHA_${remapped}`;
  return PORTED_SKILL_CODE_SET.has(candidate) ? candidate : null;
}

/** BFF piece_gacha_* / PIECE_GACHA_* を PORTED_APP_SKILL_CODES へ寄せる */
export function normalizeGachaSkillPieceCode(raw: string, char?: string | null): string {
  const upper = raw.trim().toUpperCase();
  const alias = EXPLICIT_GACHA_CODE_ALIASES[upper];
  if (alias) return alias;

  const pieceGachaMatch = upper.match(/^PIECE_GACHA_(.+)$/);
  if (pieceGachaMatch) {
    const mapped = gachaSuffixToSkillCode(pieceGachaMatch[1]!);
    if (mapped) return mapped;
  }

  const gachaMatch = upper.match(/^GACHA_(.+)$/);
  if (gachaMatch) {
    const mapped = gachaSuffixToSkillCode(gachaMatch[1]!);
    if (mapped) return mapped;
  }

  if (PORTED_SKILL_CODE_SET.has(upper)) return upper;

  const trimmedChar = char?.trim();
  if (trimmedChar && GACHA_CHAR_TO_SKILL_CODE[trimmedChar]) {
    return GACHA_CHAR_TO_SKILL_CODE[trimmedChar];
  }

  return upper;
}

export function resolveGachaGamePieceCode(char: string, pieceCode: string): string | null {
  const trimmedChar = char.trim();
  if (trimmedChar && GACHA_CHAR_TO_SKILL_CODE[trimmedChar]) {
    return GACHA_CHAR_TO_SKILL_CODE[trimmedChar];
  }
  const normalized = normalizeGachaSkillPieceCode(pieceCode, trimmedChar);
  return PORTED_SKILL_CODE_SET.has(normalized) ? normalized : null;
}
