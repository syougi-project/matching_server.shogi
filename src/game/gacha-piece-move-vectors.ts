import { resolveGamePieceCode } from '@/catalog/game-piece-code';
import type { MoveVector, PieceDefinition } from '@/types/domain';

/** 煽（ガチャ）— 縦横スライド（app.shogi AORI_MOVE_VECTORS と同一） */
export const AORI_MOVE_VECTORS: MoveVector[] = [
  { dx: -1, dy: 0, maxStep: 9 },
  { dx: 1, dy: 0, maxStep: 9 },
  { dx: 0, dy: -1, maxStep: 9 },
  { dx: 0, dy: 1, maxStep: 9 },
];

/** BFF カタログの moveVectors が未整備でも app エンジンと同じ移動にする */
export function gachaMoveVectorOverride(definition: PieceDefinition): MoveVector[] | null {
  const gameCode = resolveGamePieceCode(definition);
  if (gameCode === 'GACHA_AORI') {
    return AORI_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  return null;
}
