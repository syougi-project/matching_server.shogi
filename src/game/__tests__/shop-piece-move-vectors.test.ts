import { describe, expect, test } from 'bun:test';
import {
  intrinsicMoveVectorOverride,
  COPPER_MOVE_VECTORS,
  NAKU_MOVE_VECTORS,
  TANE_SILVER_MOVE_VECTORS,
  WAVE_MOVE_VECTORS,
} from '@/game/shop-piece-move-vectors';
import type { PieceDefinition } from '@/types/domain';

describe('shop-piece-move-vectors', () => {
  test('returns silver-like vectors for naku even when catalog vectors are empty', () => {
    const definition: PieceDefinition = {
      pieceCode: 'PIECE_SHOP_NAKU',
      canonicalCode: 'NAKU',
      char: '鳴',
      name: 'Naku',
      skill: '',
      moveVectors: [],
      canJump: false,
      isPromoted: false,
      promotable: false,
      moveConstraints: null,
      moveRules: [],
      skillDefinitionsV2: null,
      sfenCode: null,
    };
    expect(intrinsicMoveVectorOverride(definition)).toEqual(NAKU_MOVE_VECTORS);
  });

  test('returns silver-like vectors for tane even when catalog vectors are empty', () => {
    const definition: PieceDefinition = {
      pieceCode: 'PIECE_SHOP_TANE',
      canonicalCode: 'TANE',
      char: '種',
      name: 'Tane',
      skill: '',
      moveVectors: [],
      canJump: false,
      isPromoted: false,
      promotable: false,
      moveConstraints: null,
      moveRules: [],
      skillDefinitionsV2: null,
      sfenCode: null,
    };
    expect(intrinsicMoveVectorOverride(definition)).toEqual(TANE_SILVER_MOVE_VECTORS);
  });

  test('returns orthogonal 2-step vectors for wave even when catalog vectors are rook-like', () => {
    const definition: PieceDefinition = {
      pieceCode: 'PIECE_FA4D64B2BE20',
      canonicalCode: 'NAM',
      char: '波',
      name: 'Wave',
      skill: '',
      moveVectors: [
        { dx: 0, dy: -1, maxStep: 8 },
        { dx: 0, dy: 1, maxStep: 8 },
        { dx: -1, dy: 0, maxStep: 8 },
        { dx: 1, dy: 0, maxStep: 8 },
      ],
      canJump: false,
      isPromoted: false,
      promotable: false,
      moveConstraints: null,
      moveRules: [],
      skillDefinitionsV2: null,
      sfenCode: 'WAVE',
    };
    expect(intrinsicMoveVectorOverride(definition)).toEqual(WAVE_MOVE_VECTORS);
  });

  test('returns knight + forward slide vectors for copper even when catalog vectors are gold-like', () => {
    const definition: PieceDefinition = {
      pieceCode: 'COPPER',
      canonicalCode: 'COPPER',
      char: '銅',
      name: 'Copper',
      skill: '',
      moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
      canJump: false,
      isPromoted: false,
      promotable: false,
      moveConstraints: null,
      moveRules: [],
      skillDefinitionsV2: null,
      sfenCode: 'A',
    };
    expect(intrinsicMoveVectorOverride(definition)).toEqual(COPPER_MOVE_VECTORS);
  });

  test('returns rook slide vectors for fire even when catalog vectors are gold-like', () => {
    const definition: PieceDefinition = {
      pieceCode: 'FIRE',
      canonicalCode: 'FIRE',
      char: '火',
      name: 'Fire',
      skill: '',
      moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
      canJump: false,
      isPromoted: false,
      promotable: false,
      moveConstraints: null,
      moveRules: [],
      skillDefinitionsV2: null,
      sfenCode: null,
    };
    const vectors = intrinsicMoveVectorOverride(definition);
    expect(vectors?.some((v) => v.dx === 0 && v.dy === -1 && v.maxStep === 8)).toBe(true);
    expect(vectors?.some((v) => v.dx === 1 && v.dy === 0 && v.maxStep === 8)).toBe(true);
  });

  test('returns bishop slide vectors for thunder even when catalog vectors are gold-like', () => {
    const definition: PieceDefinition = {
      pieceCode: 'THUNDER',
      canonicalCode: 'THUNDER',
      char: '雷',
      name: 'Thunder',
      skill: '',
      moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
      canJump: false,
      isPromoted: false,
      promotable: false,
      moveConstraints: null,
      moveRules: [],
      skillDefinitionsV2: null,
      sfenCode: null,
    };
    const vectors = intrinsicMoveVectorOverride(definition);
    expect(vectors?.some((v) => v.dx === 1 && v.dy === -1 && v.maxStep === 8)).toBe(true);
    expect(vectors?.some((v) => v.dx === 0 && v.dy === -1)).toBe(false);
  });
});
