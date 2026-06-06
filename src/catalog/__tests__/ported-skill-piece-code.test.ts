import { describe, expect, test } from 'bun:test';
import { normalizePortedSkillPieceCode } from '@/catalog/ported-skill-piece-code';

describe('ported-skill-piece-code', () => {
  test.each([
    ['PIECE_GACHA_BAKU', '爆', 'GACHA_BAKU'],
    ['PIECE_FLAME', '炎', 'FLAME'],
    ['PIECE_C518B11858F2', '炎', 'ENN'],
    ['WATER', null, 'SUI'],
    ['PIECE_GACHA_MURO', '室', 'GACHA_SHITSU'],
    ['PIECE_GACHA_KO', '膠', 'GACHA_KOU'],
    ['FLAME', null, 'FLAME'],
  ] as const)('normalizePortedSkillPieceCode(%s, %s) -> %s', (raw, char, expected) => {
    expect(normalizePortedSkillPieceCode(raw, char)).toBe(expected);
  });
});
