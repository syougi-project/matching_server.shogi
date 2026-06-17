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
    ['PIECE_F75D88C48D6D', '牛', 'COW'],
    ['PIECE_5D848242A136', '書', 'BOOK'],
    ['PIECE_7FC715661514', '財', 'ZAI'],
    ['PIECE_124C31EA5D7A', '桜', 'CHERRY'],
    ['PIECE_C4AEB81F3634', '巨', 'GIANT'],
    ['PIECE_3EFA5702E75B', '豚', 'PIG'],
    ['PIECE_29ECAB1EF3C3', '禽', 'BIRD'],
    ['FLAME', null, 'FLAME'],
  ] as const)('normalizePortedSkillPieceCode(%s, %s) -> %s', (raw, char, expected) => {
    expect(normalizePortedSkillPieceCode(raw, char)).toBe(expected);
  });
});
