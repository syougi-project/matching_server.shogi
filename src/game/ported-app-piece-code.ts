import { normalizePortedSkillPieceCode } from '@/catalog/ported-skill-piece-code';
import { resolveGamePieceCode } from '@/catalog/game-piece-code';
import type { PieceDefinition, PlayerSide, RuleSnapshot } from '@/types/domain';

export type PortedPiece = {
  side: PlayerSide;
  code: string;
  promoted: boolean;
};

export function portedCode(raw: string, char?: string | null): string {
  return normalizePortedSkillPieceCode(raw, char ?? undefined);
}

export function resolveDef(rules: RuleSnapshot, piece: PortedPiece): PieceDefinition | null {
  return rules.piecesByCode[piece.code] ?? null;
}

export function gameCode(piece: PortedPiece, def: PieceDefinition | null): string {
  if (def) return resolveGamePieceCode(def);
  return portedCode(piece.code);
}

export function isKing(piece: PortedPiece, def: PieceDefinition | null): boolean {
  return gameCode(piece, def) === 'OU' || def?.char === '王' || def?.char === '玉';
}

export function isArmor(piece: PortedPiece, def: PieceDefinition | null): boolean {
  return gameCode(piece, def) === 'ARMOR' || def?.char === '鎧';
}

export function isSoul(piece: PortedPiece, def: PieceDefinition | null): boolean {
  return gameCode(piece, def) === 'SOUL' || def?.char === '魂';
}

export function isDeath(piece: PortedPiece, def: PieceDefinition | null): boolean {
  return gameCode(piece, def) === 'DEATH' || def?.char === '死';
}

export function isOboro(piece: PortedPiece, def: PieceDefinition | null): boolean {
  return gameCode(piece, def) === 'OBORO' || def?.char === '朧';
}

export function isHole(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'HOLE' || def?.char === '穴' || code.includes('E381DFA07A3D');
}

export function isAbyss(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'ABYSS' || def?.char === '淵' || code.includes('31CB39CC0FA8');
}

export function isDisease(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return def?.char === '病' || code.includes('151646512B2F');
}

export function isRitual(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'RITUAL' || def?.char === '礼' || code.includes('4FCDDF14D08D');
}

export function isShield(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'SHIELD' || def?.char === '盾' || code === 'SHIELD';
}

export function isKatana(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const char = def?.char ?? '';
  if (char === '剣') return false;
  return gameCode(piece, def) === 'KATANA' || char === '刀';
}

export function isHolySword(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  if (def?.char === '剣') return true;
  return gameCode(piece, def) === 'HOLY_SWORD' || code.includes('0F14ABCC6E5E');
}

export function isGun(piece: PortedPiece, def: PieceDefinition | null): boolean {
  return gameCode(piece, def) === 'GUN' || def?.char === '銃';
}

export function isMoon(piece: PortedPiece, def: PieceDefinition | null): boolean {
  return gameCode(piece, def) === 'MOON' || def?.char === '月';
}

export function isSeal(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'SEAL' || def?.char === '封' || code.includes('7000FED9D9D4');
}

export function isSaint(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'SAINT' || def?.char === '聖' || code.includes('A3BAB6C13DC7');
}

export function isMedicine(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'MEDICINE' || def?.char === '薬' || code.includes('3E3EF463EADC');
}

export function isSatori(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'SATORI' || def?.char === '悟' || code.includes('6D4AFA9CDF1C');
}

export function isHeart(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'HEART' || def?.char === '心' || code.includes('CA16911978FF');
}

export function isGear(piece: PortedPiece, def: PieceDefinition | null): boolean {
  return gameCode(piece, def) === 'GEAR' || def?.char === '歯';
}

export function isSear(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'SEAR' || def?.char === '焼' || code.includes('FDC83CF95746');
}

export function isSaute(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'SAUTE' || def?.char === '炒' || code.includes('1732246A37D8');
}

export function isStew(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'STEW' || def?.char === '煮' || code.includes('8DE5676A5E92');
}

export function hasSoulOnBoard(
  board: Map<string, PortedPiece>,
  rules: RuleSnapshot,
  side: PlayerSide,
): boolean {
  for (const piece of board.values()) {
    if (piece.side !== side) continue;
    if (isSoul(piece, resolveDef(rules, piece))) return true;
  }
  return false;
}
