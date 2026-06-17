import { resolveGamePieceCode } from '@/catalog/game-piece-code';
import type { MoveVector, PieceDefinition } from '@/types/domain';

/** HTML / 駒図鑑のスライド移動距離（9x9 盤）。 */
const SLIDE_MAX = 8;

export const ROOK_ORTHOGONAL_MOVE_VECTORS: MoveVector[] = [
  { dx: -1, dy: 0, maxStep: SLIDE_MAX },
  { dx: 1, dy: 0, maxStep: SLIDE_MAX },
  { dx: 0, dy: -1, maxStep: SLIDE_MAX },
  { dx: 0, dy: 1, maxStep: SLIDE_MAX },
];

export const BISHOP_DIAGONAL_MOVE_VECTORS: MoveVector[] = [
  { dx: -1, dy: -1, maxStep: SLIDE_MAX },
  { dx: 1, dy: -1, maxStep: SLIDE_MAX },
  { dx: -1, dy: 1, maxStep: SLIDE_MAX },
  { dx: 1, dy: 1, maxStep: SLIDE_MAX },
];

const DIAGONAL_ONE_STEP_VECTORS: MoveVector[] = [
  { dx: -1, dy: -1, maxStep: 1 },
  { dx: 1, dy: -1, maxStep: 1 },
  { dx: -1, dy: 1, maxStep: 1 },
  { dx: 1, dy: 1, maxStep: 1 },
];

const ORTHOGONAL_ONE_STEP_VECTORS: MoveVector[] = [
  { dx: -1, dy: 0, maxStep: 1 },
  { dx: 1, dy: 0, maxStep: 1 },
  { dx: 0, dy: -1, maxStep: 1 },
  { dx: 0, dy: 1, maxStep: 1 },
];

/** 龍王（成飛）: 縦横何マスでも + 斜め1マス */
export const DRAGON_KING_MOVE_VECTORS: MoveVector[] = [
  ...ROOK_ORTHOGONAL_MOVE_VECTORS,
  ...DIAGONAL_ONE_STEP_VECTORS,
];

/** 龍馬（成角）: 斜め何マスでも + 縦横1マス */
export const DRAGON_HORSE_MOVE_VECTORS: MoveVector[] = [
  ...BISHOP_DIAGONAL_MOVE_VECTORS,
  ...ORTHOGONAL_ONE_STEP_VECTORS,
];

const PROMOTED_DISPLAY_TO_BASE_GAME_CODE: Record<string, string> = {
  TO: 'FU',
  NY: 'KY',
  NK: 'KE',
  NG: 'GI',
  UM: 'KA',
  RY: 'HI',
};

export function baseGameCodeForStandardPromotion(definition: PieceDefinition): string {
  const gameCode = normalizedDefinitionCode(definition);
  return PROMOTED_DISPLAY_TO_BASE_GAME_CODE[gameCode] ?? gameCode;
}

const LANCE_FORWARD_MOVE_VECTORS: MoveVector[] = [{ dx: 0, dy: -1, maxStep: SLIDE_MAX }];

const LEAD_MOVE_VECTORS: MoveVector[] = [
  { dx: -1, dy: -2, maxStep: 1 },
  { dx: 1, dy: -2, maxStep: 1 },
  { dx: 0, dy: -1, maxStep: SLIDE_MAX },
];

const WATERFALL_MOVE_VECTORS: MoveVector[] = [
  { dx: 0, dy: -1, maxStep: SLIDE_MAX },
  { dx: -1, dy: 0, maxStep: 1 },
  { dx: 1, dy: 0, maxStep: 1 },
];

const AH_MOVE_VECTORS: MoveVector[] = [...ROOK_ORTHOGONAL_MOVE_VECTORS, ...DIAGONAL_ONE_STEP_VECTORS];

const PRISON_MOVE_VECTORS: MoveVector[] = [...ROOK_ORTHOGONAL_MOVE_VECTORS, ...DIAGONAL_ONE_STEP_VECTORS];

const CLOUD_OMNI_MOVE_VECTORS: MoveVector[] = [
  ...ROOK_ORTHOGONAL_MOVE_VECTORS,
  ...BISHOP_DIAGONAL_MOVE_VECTORS,
];

function cloneVectors(vectors: MoveVector[]): MoveVector[] {
  return vectors.map((vector) => ({ ...vector }));
}

function normalizedDefinitionCode(definition: PieceDefinition): string {
  return resolveGamePieceCode(definition).toUpperCase();
}

function definitionRawUpper(definition: PieceDefinition): string {
  return definition.pieceCode.toUpperCase();
}

function definitionChar(definition: PieceDefinition): string {
  try {
    return definition.char.trim().normalize('NFKC');
  } catch {
    return definition.char.trim();
  }
}

function definitionMatchesAliases(definition: PieceDefinition, aliases: readonly string[]): boolean {
  const gameCode = normalizedDefinitionCode(definition);
  const raw = definitionRawUpper(definition);
  const char = definitionChar(definition);
  return aliases.some((alias) => {
    const normalizedAlias = alias.trim().toUpperCase();
    if (normalizedAlias === gameCode || normalizedAlias === raw || alias === char) return true;
    if (normalizedAlias.length < 4) return false;
    return raw.includes(normalizedAlias);
  });
}

function isKatanaDefinition(definition: PieceDefinition): boolean {
  const char = definitionChar(definition);
  if (char === '剣') return false;
  if (char === '刀') return true;
  const gameCode = normalizedDefinitionCode(definition);
  return gameCode === 'KATANA' || gameCode === 'SWORD';
}

function isKenSwordDefinition(definition: PieceDefinition): boolean {
  if (definitionChar(definition) === '剣') return true;
  const gameCode = normalizedDefinitionCode(definition);
  return gameCode === 'HOLY_SWORD' || definitionRawUpper(definition).includes('0F14ABCC6E5E');
}

function isBirdDefinition(definition: PieceDefinition): boolean {
  const char = definitionChar(definition);
  const raw = definitionRawUpper(definition);
  return char === '禽' || raw.includes('BIRD') || raw.includes('29ECAB1EF3C3') || normalizedDefinitionCode(definition) === 'BIRD';
}

function isBlackOniDefinition(definition: PieceDefinition): boolean {
  return normalizedDefinitionCode(definition) === 'BLACKONI';
}

function isCloudDefinition(definition: PieceDefinition): boolean {
  return normalizedDefinitionCode(definition) === 'CLOUD' || definitionChar(definition) === '雲';
}

function isReflectiveDefinition(definition: PieceDefinition): boolean {
  return normalizedDefinitionCode(definition) === 'HIK' || definitionChar(definition) === '光';
}

function isFlameDefinition(definition: PieceDefinition): boolean {
  return definitionMatchesAliases(definition, ['ENN', 'FLAME', '炎']);
}

function isFireDefinition(definition: PieceDefinition): boolean {
  return definitionMatchesAliases(definition, ['FIRE', 'FIR', '火']);
}

function isPrisonDefinition(definition: PieceDefinition): boolean {
  const char = definitionChar(definition);
  if (char === '牢') return true;
  if (char === '柵') return false;
  return definitionMatchesAliases(definition, ['PRISON', 'ROU', '406177108665']);
}

function isFenceDefinition(definition: PieceDefinition): boolean {
  const char = definitionChar(definition);
  if (char === '柵') return true;
  return definitionMatchesAliases(definition, ['FENCE', 'SAKU', 'SAKUI', '95E4E9F3D8E5']);
}

function isLeadDefinition(definition: PieceDefinition): boolean {
  return definitionMatchesAliases(definition, ['LEAD', '鉛', '!']);
}

function isGunDefinition(definition: PieceDefinition): boolean {
  return definitionMatchesAliases(definition, ['GUN', '銃']);
}

function isADefinition(definition: PieceDefinition): boolean {
  const char = definitionChar(definition);
  if (char === 'あ') return true;
  const gameCode = normalizedDefinitionCode(definition);
  return gameCode === 'A' || definitionRawUpper(definition).includes('A9C2AD579732');
}

/** BFF カタログが金相当1マスのままでも、駒図鑑どおりのスライド移動にする。 */
export function resolveIntrinsicPortedMoveVectors(definition: PieceDefinition): MoveVector[] | null {
  if (isKatanaDefinition(definition)) return null;
  if (isBirdDefinition(definition) || isBlackOniDefinition(definition)) return null;
  if (isFenceDefinition(definition)) return null;

  if (isCloudDefinition(definition)) {
    return cloneVectors(CLOUD_OMNI_MOVE_VECTORS);
  }
  if (isReflectiveDefinition(definition)) {
    return cloneVectors(BISHOP_DIAGONAL_MOVE_VECTORS);
  }
  if (isPrisonDefinition(definition)) {
    return cloneVectors(PRISON_MOVE_VECTORS);
  }
  if (isADefinition(definition)) {
    return cloneVectors(AH_MOVE_VECTORS);
  }
  if (isLeadDefinition(definition)) {
    return cloneVectors(LEAD_MOVE_VECTORS);
  }
  if (definitionMatchesAliases(definition, ['WATERFALL', '滝', '8CC9287B7E93'])) {
    return cloneVectors(WATERFALL_MOVE_VECTORS);
  }
  if (definitionMatchesAliases(definition, ['THUNDER', '雷'])) {
    return cloneVectors(BISHOP_DIAGONAL_MOVE_VECTORS);
  }
  if (definitionMatchesAliases(definition, ['RIDGE', 'REI', '嶺', '555D2E24EFB0'])) {
    return cloneVectors(BISHOP_DIAGONAL_MOVE_VECTORS);
  }
  if (definitionMatchesAliases(definition, ['ROSE', '薔', 'A49C1E52B47A'])) {
    return cloneVectors(BISHOP_DIAGONAL_MOVE_VECTORS);
  }
  if (isKenSwordDefinition(definition)) {
    return cloneVectors(ROOK_ORTHOGONAL_MOVE_VECTORS);
  }
  if (isGunDefinition(definition)) {
    return cloneVectors(ROOK_ORTHOGONAL_MOVE_VECTORS);
  }
  if (isFireDefinition(definition) && !isFlameDefinition(definition)) {
    return cloneVectors(ROOK_ORTHOGONAL_MOVE_VECTORS);
  }
  if (
    definitionMatchesAliases(definition, [
      'HOS',
      '星',
      'DEMON',
      'MAK',
      '魔',
      'ELECTRIC',
      '電',
      'SNOW',
      '雪',
      'WIND',
      '風',
      'BOAT',
      '舟',
      'BIGNOISE',
      '轟',
      'D24741D0EF18',
      'ABYSS',
      '淵',
      '31CB39CC0FA8',
    ])
  ) {
    return cloneVectors(ROOK_ORTHOGONAL_MOVE_VECTORS);
  }
  if (definitionMatchesAliases(definition, ['KY', '香'])) {
    return cloneVectors(LANCE_FORWARD_MOVE_VECTORS);
  }
  if (definitionMatchesAliases(definition, ['HI', '飛'])) {
    return cloneVectors(ROOK_ORTHOGONAL_MOVE_VECTORS);
  }
  if (definitionMatchesAliases(definition, ['KA', '角'])) {
    return cloneVectors(BISHOP_DIAGONAL_MOVE_VECTORS);
  }
  if (definitionChar(definition) === '山' || definitionMatchesAliases(definition, ['YAMA'])) {
    return cloneVectors(DIAGONAL_ONE_STEP_VECTORS);
  }

  return null;
}
