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

/** BFF カタログの moveVectors が未整備でも app エンジンと同じ移動にする。 */
export function intrinsicMoveVectorOverride(definition: PieceDefinition): MoveVector[] | null {
  const gacha = gachaMoveVectorOverride(definition);
  if (gacha) return gacha;
  if (isNakuDefinition(definition) || isTaneDefinition(definition)) {
    return TANE_SILVER_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  if (isWaveDefinition(definition)) {
    return WAVE_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  if (isCopperDefinition(definition)) {
    return COPPER_MOVE_VECTORS.map((vector) => ({ ...vector }));
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
