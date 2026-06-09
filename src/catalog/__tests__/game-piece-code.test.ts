import { describe, expect, test } from 'bun:test';
import { resolveGamePieceCode } from '@/catalog/game-piece-code';
import type { PieceDefinition } from '@/types/domain';

describe('resolveGamePieceCode', () => {
  test('maps small dragon 竜 to RYU, not promoted rook RY', () => {
    const smallDragon: PieceDefinition = {
      pieceCode: 'PIECE_3D76F6398BE6',
      canonicalCode: 'RYU',
      char: '竜',
      name: '小竜',
      skill: '',
      moveVectors: [],
      canJump: false,
      isPromoted: false,
      promotable: false,
      moveConstraints: null,
      moveRules: [],
      skillDefinitionsV2: null,
      sfenCode: 'F',
    };
    expect(resolveGamePieceCode(smallDragon)).toBe('RYU');
  });

  test('maps promoted rook display char 龍 to RY', () => {
    const promotedRook: PieceDefinition = {
      pieceCode: 'RY',
      canonicalCode: 'RY',
      char: '龍',
      name: '龍',
      skill: '',
      moveVectors: [],
      canJump: false,
      isPromoted: true,
      promotable: false,
      moveConstraints: null,
      moveRules: [],
      skillDefinitionsV2: null,
      sfenCode: 'R',
    };
    expect(resolveGamePieceCode(promotedRook)).toBe('RY');
  });
});
