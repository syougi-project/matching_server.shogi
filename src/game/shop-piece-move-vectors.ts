import { resolveGamePieceCode } from '@/catalog/game-piece-code';
import { gachaMoveVectorOverride } from '@/game/gacha-piece-move-vectors';
import { resolveIntrinsicPortedMoveVectors } from '@/game/ported-app-move-vectors';
import {
  RYU_DRAGON_MOVE_VECTORS,
  SPRING_MOVE_VECTORS,
  TATSU_DRAGON_AWAKENED_MOVE_VECTORS,
} from '@/game/spring-ryu-awakening';
import type { MoveVector, PieceDefinition } from '@/types/domain';

/** 種・鳴（app.shogi TANE_SILVER_MOVE_VECTORS）— 前・前斜め左右・後斜め左右に各1マス。 */
export const TANE_SILVER_MOVE_VECTORS: MoveVector[] = [
  { dx: -1, dy: -1, maxStep: 1 },
  { dx: 0, dy: -1, maxStep: 1 },
  { dx: 1, dy: -1, maxStep: 1 },
  { dx: -1, dy: 1, maxStep: 1 },
  { dx: 1, dy: 1, maxStep: 1 },
];

/** 鳴（app.shogi NAKU_MOVE_VECTORS / 銀相当）— 前・前斜め左右・後斜め左右に各1マス。 */
export const NAKU_MOVE_VECTORS: MoveVector[] = TANE_SILVER_MOVE_VECTORS;

/** 銅（HTML: copperMoves）— 桂馬飛び + 前方に何マスでも。 */
export const COPPER_MOVE_VECTORS: MoveVector[] = [
  { dx: -1, dy: -2, maxStep: 1 },
  { dx: 1, dy: -2, maxStep: 1 },
  { dx: 0, dy: -1, maxStep: 8 },
];

/** 幻 — 前後左右1マス + 桂馬飛び（HTML phantomMoves 準拠）。 */
export const PHANTOM_MOVE_VECTORS: MoveVector[] = [
  { dx: -1, dy: 0, maxStep: 1 },
  { dx: 1, dy: 0, maxStep: 1 },
  { dx: 0, dy: -1, maxStep: 1 },
  { dx: 0, dy: 1, maxStep: 1 },
  { dx: -1, dy: -2, maxStep: 1 },
  { dx: 1, dy: -2, maxStep: 1 },
];

/** 禽 — 前後左右スライド8（app normalizeVectorsForBird 準拠）。 */
export const BIRD_MOVE_VECTORS: MoveVector[] = [
  { dx: 0, dy: -1, maxStep: 8 },
  { dx: -1, dy: 0, maxStep: 8 },
  { dx: 1, dy: 0, maxStep: 8 },
  { dx: 0, dy: 1, maxStep: 8 },
];

/** 桂 — BFF カタログに canJump が無い場合の保険。 */
export const KNIGHT_MOVE_VECTORS: MoveVector[] = [
  { dx: -1, dy: -2, maxStep: 1 },
  { dx: 1, dy: -2, maxStep: 1 },
];

/** 山 — 斜め4方向に各1マス（HTML mountainMoves 準拠）。 */
export const YAMA_MOVE_VECTORS: MoveVector[] = [
  { dx: -1, dy: -1, maxStep: 1 },
  { dx: 1, dy: -1, maxStep: 1 },
  { dx: -1, dy: 1, maxStep: 1 },
  { dx: 1, dy: 1, maxStep: 1 },
];

/** 波（HTML: waveMoves）— 前後左右に各2マスまで。 */
export const WAVE_MOVE_VECTORS: MoveVector[] = [
  { dx: 0, dy: -1, maxStep: 2 },
  { dx: 0, dy: 1, maxStep: 2 },
  { dx: -1, dy: 0, maxStep: 2 },
  { dx: 1, dy: 0, maxStep: 2 },
];

function isNakuDefinition(definition: PieceDefinition): boolean {
  const char = definition.char.trim();
  const code = definition.pieceCode.toUpperCase();
  const gameCode = resolveGamePieceCode(definition);
  return (
    char === '鳴' ||
    gameCode === 'NAKU' ||
    gameCode === 'SHOP_NAKU' ||
    code.includes('NAKU') ||
    code.includes('SHOP_NAKU')
  );
}

function isTaneDefinition(definition: PieceDefinition): boolean {
  const char = definition.char.trim();
  const code = definition.pieceCode.toUpperCase();
  const gameCode = resolveGamePieceCode(definition);
  return (
    char === '種' ||
    gameCode === 'TANE' ||
    gameCode === 'SHOP_TANE' ||
    code.includes('TANE') ||
    code.includes('SHOP_TANE')
  );
}

function isCopperDefinition(definition: PieceDefinition): boolean {
  const char = definition.char.trim();
  const code = definition.pieceCode.toUpperCase();
  const gameCode = resolveGamePieceCode(definition);
  return (
    char === '銅' ||
    gameCode === 'COPPER' ||
    code.includes('COPPER')
  );
}

function isPhantomDefinition(definition: PieceDefinition): boolean {
  const char = definition.char.trim();
  const code = definition.pieceCode.toUpperCase();
  const gameCode = resolveGamePieceCode(definition);
  return char === '幻' || gameCode === 'PHANTOM' || code.includes('PHANTOM');
}

function isYamaDefinition(definition: PieceDefinition): boolean {
  const char = definition.char.trim();
  const code = definition.pieceCode.toUpperCase();
  const gameCode = resolveGamePieceCode(definition);
  return char === '山' || gameCode === 'YAMA' || code.includes('YAMA');
}

function isWaveDefinition(definition: PieceDefinition): boolean {
  const char = definition.char.trim();
  const code = definition.pieceCode.toUpperCase();
  const gameCode = resolveGamePieceCode(definition);
  return (
    char === '波' ||
    gameCode === 'NAM' ||
    gameCode === 'WAVE' ||
    code.includes('NAM') ||
    code.includes('WAVE')
  );
}

function isRyuDefinition(definition: PieceDefinition): boolean {
  const char = definition.char.trim();
  const code = definition.pieceCode.toUpperCase();
  const gameCode = resolveGamePieceCode(definition);
  return char === '竜' || gameCode === 'RYU' || code.includes('RYU');
}

function isTatsuDefinition(definition: PieceDefinition): boolean {
  const char = definition.char.trim();
  const code = definition.pieceCode.toUpperCase();
  const gameCode = resolveGamePieceCode(definition);
  return char === '辰' || gameCode === 'TATSU' || code.includes('TATSU');
}

function isSpringDefinition(definition: PieceDefinition): boolean {
  const char = definition.char.trim();
  const code = definition.pieceCode.toUpperCase();
  const gameCode = resolveGamePieceCode(definition);
  return char === '泉' || gameCode === 'SPRING' || code.includes('SPRING');
}

function isHouseDefinition(definition: PieceDefinition): boolean {
  const char = definition.char.trim();
  const code = definition.pieceCode.toUpperCase();
  const gameCode = resolveGamePieceCode(definition);
  return char === '家' || gameCode === 'HOUSE' || code.includes('HOUSE') || code.endsWith('_ZIE');
}

function isFieldDefinition(definition: PieceDefinition): boolean {
  const char = definition.char.trim();
  const code = definition.pieceCode.toUpperCase();
  const gameCode = resolveGamePieceCode(definition);
  return char === '畑' || gameCode === 'FIELD' || code.includes('FIELD') || code.endsWith('_ZTA');
}

function isBirdDefinition(definition: PieceDefinition): boolean {
  const char = definition.char.trim();
  const code = definition.pieceCode.toUpperCase();
  const gameCode = resolveGamePieceCode(definition);
  return char === '禽' || gameCode === 'BIRD' || code.includes('BIRD') || code.includes('29ECAB1EF3C3');
}

function isKnightDefinition(definition: PieceDefinition): boolean {
  const char = definition.char.trim();
  const code = definition.pieceCode.toUpperCase();
  const gameCode = resolveGamePieceCode(definition);
  return char === '桂' || gameCode === 'KE' || code === 'KE' || code === 'KNIGHT';
}

export function intrinsicCanJumpOverride(definition: PieceDefinition): boolean {
  const char = definition.char.trim();
  const code = definition.pieceCode.toUpperCase();
  const gameCode = resolveGamePieceCode(definition);
  return char === '桂' || gameCode === 'KE' || code === 'KE';
}

/** BFF カタログの moveVectors / canJump が未整備でも app エンジンと同じ移動にする。 */
export function intrinsicMoveVectorOverride(definition: PieceDefinition): MoveVector[] | null {
  const gacha = gachaMoveVectorOverride(definition);
  if (gacha) return gacha;
  if (isHouseDefinition(definition) || isFieldDefinition(definition)) {
    return [];
  }
  if (isNakuDefinition(definition) || isTaneDefinition(definition)) {
    return TANE_SILVER_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  if (isWaveDefinition(definition)) {
    return WAVE_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  if (isCopperDefinition(definition)) {
    return COPPER_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  if (isPhantomDefinition(definition)) {
    return PHANTOM_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  if (isYamaDefinition(definition)) {
    return YAMA_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  if (isBirdDefinition(definition)) {
    return BIRD_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  if (isKnightDefinition(definition)) {
    return KNIGHT_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  if (isRyuDefinition(definition)) {
    return RYU_DRAGON_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  if (isTatsuDefinition(definition)) {
    return TATSU_DRAGON_AWAKENED_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  if (isSpringDefinition(definition)) {
    return SPRING_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  const ported = resolveIntrinsicPortedMoveVectors(definition);
  if (ported) {
    return ported.map((vector) => ({ ...vector }));
  }
  return null;
}
