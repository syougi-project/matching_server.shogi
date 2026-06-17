import { normalizeGachaSkillPieceCode } from '@/catalog/gacha-skill-piece-code';
import { PORTED_APP_SKILL_CODES } from '@/game/ported-app-skill-codes';

const PORTED_SKILL_CODE_SET = new Set<string>(PORTED_APP_SKILL_CODES);

/** app.shogi char-to-piece-code-map と整合（matching_server スキル判定用） */
const CHAR_TO_SKILL_CODE: Readonly<Record<string, string>> = {
  炎: 'ENN',
  火: 'FIR',
  水: 'SUI',
  波: 'NAM',
  木: 'MOK',
  葉: 'HAA',
  種: 'TANE',
  闇: 'YAM',
  魔: 'MAK',
  鉄: 'IRON',
  錫: 'TIN',
  宝: 'TREASURE',
  電: 'ELECTRIC',
  雷: 'THUNDER',
  時: 'TIME',
  獣: 'BEAST',
  氷: 'ICE',
  雪: 'SNOW',
  砂: 'SAND',
  風: 'WIND',
  苔: 'MOSS',
  魚: 'FISH',
  虹: 'RAINBOW',
  毒: 'POISON',
  沼: 'SWAMP',
  牢: 'PRISON',
  柵: 'FENCE',
  嶺: 'RIDGE',
  峰: 'PEAK',
  家: 'HOUSE',
  民: 'PEOPLE',
  畑: 'FIELD',
  岩: 'ROCK',
  鉱: 'ORE',
  墓: 'GRAVE',
  鬱: 'DEPRESSION',
  薔: 'ROSE',
  菊: 'CHRYSANTHEMUM',
  牛: 'COW',
  銭: 'SEN',
  財: 'ZAI',
  辰: 'TATSU',
  竜: 'RYU',
  泉: 'SPRING',
  実: 'EXPERIMENT',
  轟: 'BIGNOISE',
  犇: 'BULL',
  赤鬼: 'REDONI',
  青鬼: 'BLUEONI',
  黒鬼: 'BLACKONI',
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
  舞: 'MAI',
  滝: 'WATERFALL',
  禽: 'BIRD',
  豚: 'PIG',
};

/** BFF instance id の hex 断片 → canonical skill code */
const OPAQUE_HEX_TO_SKILL_CODE: Readonly<Record<string, string>> = {
  '8CC9287B7E93': 'WATERFALL',
  '29ECAB1EF3C3': 'BIRD',
  '3EFA5702E75B': 'PIG',
  'F75D88C48D6D': 'COW',
  '5D848242A136': 'BOOK',
  '7FC715661514': 'ZAI',
  '124C31EA5D7A': 'CHERRY',
  'C4AEB81F3634': 'GIANT',
  '6D4AFA9CDF1C': 'SATORI',
  'CA16911978FF': 'HEART',
};

function resolveOpaqueHexSkillCode(code: string): string | null {
  for (const [hex, skillCode] of Object.entries(OPAQUE_HEX_TO_SKILL_CODE)) {
    if (code.includes(hex)) return skillCode;
  }
  return null;
}

function stripNamedPiecePrefix(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!upper.startsWith('PIECE_')) return upper;
  if (/^PIECE_[0-9A-F]{8,}$/i.test(upper)) return upper;
  if (upper.startsWith('PIECE_SHOGI_')) return upper.slice('PIECE_SHOGI_'.length);
  return upper.slice('PIECE_'.length);
}

/** BFF / instance id / 漢字から PORTED_APP_SKILL_CODES へ寄せる */
export function normalizePortedSkillPieceCode(raw: string, char?: string | null): string {
  const fromGacha = normalizeGachaSkillPieceCode(raw, char);
  let code = stripNamedPiecePrefix(fromGacha);

  if (code === 'WATER') return 'SUI';
  if (PORTED_SKILL_CODE_SET.has(code)) return code;
  const fromOpaqueHex = resolveOpaqueHexSkillCode(code);
  if (fromOpaqueHex) return fromOpaqueHex;

  const trimmedChar = char?.trim();
  if (trimmedChar && CHAR_TO_SKILL_CODE[trimmedChar]) {
    return CHAR_TO_SKILL_CODE[trimmedChar];
  }

  return code;
}

export function resolvePortedGamePieceCode(char: string, pieceCode: string): string | null {
  const normalized = normalizePortedSkillPieceCode(pieceCode, char);
  return PORTED_SKILL_CODE_SET.has(normalized) ? normalized : null;
}
