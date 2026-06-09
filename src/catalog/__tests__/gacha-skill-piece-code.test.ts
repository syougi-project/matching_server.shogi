import { describe, expect, test } from 'bun:test';
import {
  normalizeGachaSkillPieceCode,
  resolveGachaGamePieceCode,
} from '@/catalog/gacha-skill-piece-code';

describe('gacha-skill-piece-code', () => {
  test.each([
    ['PIECE_GACHA_BAKU', 'GACHA_BAKU'],
    ['piece_gacha_baku', 'GACHA_BAKU'],
    ['PIECE_GACHA_KO', 'GACHA_KOU'],
    ['PIECE_GACHA_MURO', 'GACHA_SHITSU'],
    ['PIECE_GACHA_TO', 'GACHA_TOU2'],
    ['GACHA_BAKU', 'GACHA_BAKU'],
    ['PIECE_GACHA_AORI', 'GACHA_AORI'],
    ['piece_gacha_aori', 'GACHA_AORI'],
  ] as const)('normalizeGachaSkillPieceCode(%s) -> %s', (raw, expected) => {
    expect(normalizeGachaSkillPieceCode(raw)).toBe(expected);
  });

  test('falls back to gacha char when wire code is unknown', () => {
    expect(normalizeGachaSkillPieceCode('PIECE_C518B11858F2', '爆')).toBe('GACHA_BAKU');
  });

  test('resolveGachaGamePieceCode prefers char mapping', () => {
    expect(resolveGachaGamePieceCode('爆', 'piece_gacha_baku')).toBe('GACHA_BAKU');
    expect(resolveGachaGamePieceCode('煽', 'piece_gacha_aori')).toBe('GACHA_AORI');
  });
});
