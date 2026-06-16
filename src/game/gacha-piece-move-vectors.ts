import { resolveGamePieceCode } from '@/catalog/game-piece-code';
import type { MoveVector, PieceDefinition } from '@/types/domain';

/** 煽（ガチャ）— 縦横スライド（app.shogi AORI_MOVE_VECTORS と同一） */
export const AORI_MOVE_VECTORS: MoveVector[] = [
  { dx: -1, dy: 0, maxStep: 9 },
  { dx: 1, dy: 0, maxStep: 9 },
  { dx: 0, dy: -1, maxStep: 9 },
  { dx: 0, dy: 1, maxStep: 9 },
];

/** 艸（ガチャ）— 前2 + 左右後1（app.shogi SOU_MOVE_VECTORS と同一） */
export const SOU_MOVE_VECTORS: MoveVector[] = [
  { dx: 0, dy: -1, maxStep: 2 },
  { dx: -1, dy: 0, maxStep: 1 },
  { dx: 1, dy: 0, maxStep: 1 },
  { dx: 0, dy: 1, maxStep: 1 },
];

/** 閹（ガチャ）— 前後左右1マス（app.shogi EN_MOVE_VECTORS と同一。王前1マスは合法手生成で追加）。 */
export const EN_MOVE_VECTORS: MoveVector[] = [
  { dx: -1, dy: 0, maxStep: 1 },
  { dx: 1, dy: 0, maxStep: 1 },
  { dx: 0, dy: -1, maxStep: 1 },
  { dx: 0, dy: 1, maxStep: 1 },
];

/** BFF カタログの moveVectors が未整備でも app エンジンと同じ移動にする */
export function gachaMoveVectorOverride(definition: PieceDefinition): MoveVector[] | null {
  const gameCode = resolveGamePieceCode(definition);
  if (gameCode === 'GACHA_AORI') {
    return AORI_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  if (gameCode === 'GACHA_SOU' || definition.char.trim() === '艸') {
    return SOU_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  if (gameCode === 'GACHA_EN' || definition.char.trim() === '閹') {
    return EN_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  return null;
}
