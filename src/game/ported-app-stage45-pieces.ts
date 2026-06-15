import type { MoveVector, PieceDefinition, PlayerSide, RuleSnapshot } from '@/types/domain';
import { hasSoulOnBoard, isArmor, isKing, resolveDef } from '@/game/ported-app-piece-code';
import {
  decodePigInheritedSuffix,
  encodePigInheritedSuffix,
  isBondProtectedFromCapture,
  isGiant,
  type RemainingBoard,
} from '@/game/ported-app-remaining-pieces';

type Square = { row: number; col: number };

export type Stage45Piece = {
  side: PlayerSide;
  code: string;
  promoted: boolean;
  pigInheritedCode?: string;
  pigInheritedPromoted?: boolean;
  cowChargeCount?: number;
};

export const SEN_ZAI_FALLBACK_MOVE_VECTORS: MoveVector[] = [
  { dx: -1, dy: -1, maxStep: 1 },
  { dx: 0, dy: -1, maxStep: 1 },
  { dx: 1, dy: -1, maxStep: 1 },
  { dx: -1, dy: 0, maxStep: 1 },
  { dx: 1, dy: 0, maxStep: 1 },
  { dx: 0, dy: 1, maxStep: 1 },
];

export function isCow(piece: Stage45Piece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'COW' || def?.char === '牛' || code.includes('F75D88C48D6D');
}

export function isSen(piece: Stage45Piece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'SEN' || def?.char === '銭' || code.includes('EACC7F540399');
}

export function isZai(piece: Stage45Piece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'ZAI' || def?.char === '財' || code.includes('7FC715661514');
}

export function isYangAuraPiece(piece: Stage45Piece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'YANG' || def?.char === '陽' || code.includes('313B9456C8AC');
}

export function isYinSuppressPiece(piece: Stage45Piece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'YIN' || def?.char === '陰' || code.includes('A67CE76969F7');
}

function gameCode(piece: Stage45Piece, def: PieceDefinition | null): string {
  return (def?.pieceCode ?? piece.code).trim().toUpperCase();
}

export function encodeCowChargeSuffix(piece: Stage45Piece): string {
  if (!isCow(piece, null) && !piece.code.toUpperCase().includes('COW')) return '';
  const charge = Math.min(8, Math.max(0, Math.floor(piece.cowChargeCount ?? 0)));
  return charge > 0 ? `@${charge}` : '';
}

export function decodeCowChargeSuffix(rawCode: string): {
  codePart: string;
  cowChargeCount: number;
} {
  const atIdx = rawCode.indexOf('@');
  if (atIdx < 0) return { codePart: rawCode, cowChargeCount: 0 };
  const pigIdx = rawCode.indexOf('>', atIdx);
  const chargeRaw = rawCode.slice(atIdx + 1, pigIdx >= 0 ? pigIdx : undefined);
  const charge = Math.min(8, Math.max(0, Number.parseInt(chargeRaw, 10) || 0));
  const codePart = rawCode.slice(0, atIdx) + (pigIdx >= 0 ? rawCode.slice(pigIdx) : '');
  return { codePart, cowChargeCount: charge };
}

export function encodeStage45PieceSuffixes(piece: Stage45Piece): string {
  return `${encodeCowChargeSuffix(piece)}${encodePigInheritedSuffix(piece)}`;
}

export function decodeStage45PieceCodePart(rawCode: string): {
  code: string;
  promoted: boolean;
  pigInheritedCode?: string;
  pigInheritedPromoted?: boolean;
  cowChargeCount: number;
} {
  let codePart = rawCode;
  let promoted = false;
  if (!codePart.includes('>') && codePart.endsWith('+')) {
    promoted = true;
    codePart = codePart.slice(0, -1);
  }
  const cowDecoded = decodeCowChargeSuffix(codePart);
  const pigDecoded = decodePigInheritedSuffix(cowDecoded.codePart);
  return {
    code: pigDecoded.code.toUpperCase(),
    promoted,
    pigInheritedCode: pigDecoded.pigInheritedCode,
    pigInheritedPromoted: pigDecoded.pigInheritedPromoted,
    cowChargeCount: cowDecoded.cowChargeCount,
  };
}

export function cowForwardRowDelta(side: PlayerSide): number {
  return side === 'black' ? -1 : 1;
}

export function computeCowForwardPathDistance(
  side: PlayerSide,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
): number | null {
  if (fromCol !== toCol) return null;
  const d = cowForwardRowDelta(side);
  const dr = toRow - fromRow;
  if (dr === 0) return null;
  if (dr % d !== 0) return null;
  const dist = dr / d;
  return dist >= 1 ? dist : null;
}

export function generateCowForwardChargedTargets(input: {
  board: RemainingBoard;
  rules: RuleSnapshot;
  skillState: { board_hazards: Record<string, unknown>[] };
  piece: Stage45Piece;
  from: Square;
  formatSquare: (row: number, col: number) => string;
  isCellBlockedByHazard: (row: number, col: number) => boolean;
}): Square[] {
  const charge = Math.min(8, Math.max(0, Math.floor(input.piece.cowChargeCount ?? 0)));
  const maxDist = Math.min(8, 1 + charge);
  const d = cowForwardRowDelta(input.piece.side);
  const out: Square[] = [];
  const seen = new Set<string>();

  for (let dist = 1; dist <= maxDist; dist += 1) {
    let ok = true;
    for (let s = 1; s <= dist; s += 1) {
      const row = input.from.row + d * s;
      const col = input.from.col;
      if (row < 0 || row > 8 || col < 0 || col > 8) {
        ok = false;
        break;
      }
      if (input.isCellBlockedByHazard(row, col)) {
        ok = false;
        break;
      }
      const square = input.formatSquare(row, col);
      const occupant = input.board.get(square);
      if (occupant && occupant.side === input.piece.side) {
        ok = false;
        break;
      }
      if (occupant && occupant.side !== input.piece.side) {
        const def = resolveDef(input.rules, occupant);
        if (isArmor(occupant, def)) {
          ok = false;
          break;
        }
        if (isKing(occupant, def) && hasSoulOnBoard(input.board, input.rules, occupant.side)) {
          ok = false;
          break;
        }
        if (isGiant(occupant, def)) {
          ok = false;
          break;
        }
        if (
          isBondProtectedFromCapture(
            input.board,
            input.rules,
            square,
            occupant,
            input.formatSquare,
          )
        ) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) continue;
    const landRow = input.from.row + d * dist;
    const landCol = input.from.col;
    const key = `${landRow}:${landCol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ row: landRow, col: landCol });
  }
  return out;
}

export function maybeApplySenMoveSkillTransform(
  piece: Stage45Piece,
  rules: RuleSnapshot,
): Stage45Piece {
  const def = resolveDef(rules, piece);
  if (!isSen(piece, def)) return piece;
  const roll = Math.random();
  if (roll < 0.2) {
    return { ...piece, code: 'KI', promoted: false, pigInheritedCode: undefined, pigInheritedPromoted: undefined };
  }
  if (roll < 0.3) {
    return {
      ...piece,
      code: 'TREASURE',
      promoted: false,
      pigInheritedCode: undefined,
      pigInheritedPromoted: undefined,
    };
  }
  return piece;
}

export function applyZaiSkillReplaceAllySenWithCaptured(input: {
  board: RemainingBoard;
  rules: RuleSnapshot;
  actorSide: PlayerSide;
  capturedEnemy: Stage45Piece;
  zaiLandingSquare: string;
}): boolean {
  const allies: Array<{ square: string; piece: Stage45Piece }> = [];
  for (const [square, piece] of input.board.entries()) {
    if (piece.side !== input.actorSide) continue;
    if (square === input.zaiLandingSquare) continue;
    const def = resolveDef(input.rules, piece);
    if (!isSen(piece, def)) continue;
    allies.push({ square, piece });
  }
  allies.sort((a, b) => a.square.localeCompare(b.square));
  const target = allies[0];
  if (!target) return false;
  input.board.set(target.square, {
    ...input.capturedEnemy,
    side: input.actorSide,
    pigInheritedCode: undefined,
    pigInheritedPromoted: undefined,
  });
  return true;
}

export const YANG_ALLY_SKILL_PROC_FACTOR = 1.3;

export function applyYangAllySkillProcMultiplier(baseChance: number, yangFactor: number): number {
  if (yangFactor <= 1) return baseChance;
  if (!Number.isFinite(baseChance) || baseChance <= 0) return baseChance;
  if (baseChance >= 1) return baseChance;
  return Math.min(1, baseChance * yangFactor);
}

export function computeYangSkillProcFactorForMover(
  board: RemainingBoard,
  rules: RuleSnapshot,
  actorSide: PlayerSide,
  movedPiece: Stage45Piece | null,
  movedSquare: string | null,
): number {
  if (!movedPiece || movedPiece.side !== actorSide || !movedSquare) return 1;
  if (isGiant(movedPiece, resolveDef(rules, movedPiece))) return 1;
  const moverPos = parseSquareKey(movedSquare);
  for (const [square, piece] of board.entries()) {
    if (piece.side !== actorSide) continue;
    const def = resolveDef(rules, piece);
    if (!isYangAuraPiece(piece, def)) continue;
    const yangPos = parseSquareKey(square);
    const dr = Math.abs(yangPos.row - moverPos.row);
    const dc = Math.abs(yangPos.col - moverPos.col);
    if (dr <= 1 && dc <= 1 && (dr !== 0 || dc !== 0)) return YANG_ALLY_SKILL_PROC_FACTOR;
  }
  return 1;
}

export function isActorSkillProcSuppressedByAdjacentEnemyYin(
  board: RemainingBoard,
  rules: RuleSnapshot,
  actorSide: PlayerSide,
  movedPiece: Stage45Piece | null,
  movedSquare: string | null,
): boolean {
  if (!movedPiece || movedPiece.side !== actorSide) return false;
  if (isGiant(movedPiece, resolveDef(rules, movedPiece))) return false;
  if (!movedSquare) return false;
  const center = parseSquareKey(movedSquare);
  for (const [square, piece] of board.entries()) {
    const def = resolveDef(rules, piece);
    if (!isYinSuppressPiece(piece, def)) continue;
    if (piece.side === movedPiece.side) continue;
    const yinPos = parseSquareKey(square);
    const dr = Math.abs(yinPos.row - center.row);
    const dc = Math.abs(yinPos.col - center.col);
    if (dr <= 1 && dc <= 1 && (dr !== 0 || dc !== 0)) return true;
  }
  return false;
}

export function resolveSenZaiFallbackVectors(
  piece: Stage45Piece,
  def: PieceDefinition | null,
  vectors: MoveVector[],
): MoveVector[] {
  if (vectors.length > 0) return vectors;
  if (isSen(piece, def) || isZai(piece, def)) return SEN_ZAI_FALLBACK_MOVE_VECTORS.map((v) => ({ ...v }));
  return vectors;
}

function parseSquareKey(square: string): Square {
  const file = Number.parseInt(square[0] ?? '', 10);
  const rank = square[1] ?? 'a';
  const ranks = 'abcdefghi';
  return { row: ranks.indexOf(rank), col: 9 - file };
}
