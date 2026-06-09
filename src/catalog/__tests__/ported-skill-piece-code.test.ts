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
    ['PIECE_SHOP_MAI', '舞', 'SHOP_MAI'],
    ['PIECE_SHOP_MAI', null, 'SHOP_MAI'],
    ['MAI', '舞', 'MAI'],
    ['PIECE_SHOP_TANE', '種', 'SHOP_TANE'],
    ['TANE', '種', 'TANE'],
    ['PIECE_3D76F6398BE6', '竜', 'RYU'],
    ['PIECE_3319765CD612', '泉', 'SPRING'],
    ['FLAME', null, 'FLAME'],
  ] as const)('normalizePortedSkillPieceCode(%s, %s) -> %s', (raw, char, expected) => {
    expect(normalizePortedSkillPieceCode(raw, char)).toBe(expected);
  });
});
