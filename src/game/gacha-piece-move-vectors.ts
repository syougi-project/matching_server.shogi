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

/** 炒（ステージ46）— 前2 + 左右後1（app.shogi SAUTE_MOVE_VECTORS / HTML stirMoves と同一） */
export const SAUTE_MOVE_VECTORS: MoveVector[] = SOU_MOVE_VECTORS.map((vector) => ({ ...vector }));

/** 焼（ステージ46）— 前2 + 左右後1（app.shogi SEAR_MOVE_VECTORS / HTML roastMoves と同一） */
export const SEAR_MOVE_VECTORS: MoveVector[] = SOU_MOVE_VECTORS.map((vector) => ({ ...vector }));

/** 膠（ガチャ）— 前斜め2 + 後1（app.shogi KOU_MOVE_VECTORS / HTML koMoves と同一） */
export const KOU_MOVE_VECTORS: MoveVector[] = [
  { dx: -1, dy: -1, maxStep: 1 },
  { dx: 1, dy: -1, maxStep: 1 },
  { dx: 0, dy: 1, maxStep: 1 },
];

/** 閹（ガチャ）— 前後左右1マス（app.shogi EN_MOVE_VECTORS と同一。王前1マスは合法手生成で追加）。 */
export const EN_MOVE_VECTORS: MoveVector[] = [
  { dx: -1, dy: 0, maxStep: 1 },
  { dx: 1, dy: 0, maxStep: 1 },
  { dx: 0, dy: -1, maxStep: 1 },
  { dx: 0, dy: 1, maxStep: 1 },
];

/** 灯（ガチャ）— 前後左右1マス + 後斜め2方向（app.shogi TOU_MOVE_VECTORS と同一）。 */
export const TOU_MOVE_VECTORS: MoveVector[] = [
  { dx: 0, dy: -1, maxStep: 1 },
  { dx: 0, dy: 1, maxStep: 1 },
  { dx: -1, dy: 0, maxStep: 1 },
  { dx: 1, dy: 0, maxStep: 1 },
  { dx: -1, dy: 1, maxStep: 1 },
  { dx: 1, dy: 1, maxStep: 1 },
];

/** 逃（ガチャ）— 全方向1マス（app.shogi NIGE_MOVE_VECTORS と同一）。 */
export const NIGE_MOVE_VECTORS: MoveVector[] = [
  { dx: -1, dy: -1, maxStep: 1 },
  { dx: 0, dy: -1, maxStep: 1 },
  { dx: 1, dy: -1, maxStep: 1 },
  { dx: -1, dy: 0, maxStep: 1 },
  { dx: 1, dy: 0, maxStep: 1 },
  { dx: -1, dy: 1, maxStep: 1 },
  { dx: 0, dy: 1, maxStep: 1 },
  { dx: 1, dy: 1, maxStep: 1 },
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
  if (gameCode === 'GACHA_KOU' || gameCode === 'GACHA_KO' || definition.char.trim() === '膠') {
    return KOU_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  if (gameCode === 'GACHA_TOU' || definition.char.trim() === '灯') {
    return TOU_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  if (gameCode === 'GACHA_TOU2' || definition.char.trim() === '逃') {
    return NIGE_MOVE_VECTORS.map((vector) => ({ ...vector }));
  }
  return null;
}
