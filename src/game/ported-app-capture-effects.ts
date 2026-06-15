import type { PlayerSide, RuleSnapshot } from '@/types/domain';
import {
  isAbyss,
  isArmor,
  isDeath,
  isDisease,
  isHeart,
  isHole,
  isKatana,
  isKing,
  isOboro,
  isRitual,
  isSatori,
  isSeal,
  isSear,
  isShield,
  isSoul,
  isSaute,
  isStew,
  resolveDef,
  type PortedPiece,
} from '@/game/ported-app-piece-code';

type InternalBoard = Map<string, PortedPiece>;
type InternalHands = Record<PlayerSide, Record<string, number>>;
type SkillState = {
  board_hazards: Record<string, unknown>[];
  board_arrow_tiles: Record<string, unknown>[];
  movement_modifiers: Record<string, unknown>[];
  piece_statuses: Record<string, unknown>[];
  piece_defenses: Record<string, unknown>[];
};

type Square = { row: number; col: number };

const SHIELD_ABORT_PROC_CHANCE = 0.5;

function shieldForwardRowDelta(side: PlayerSide): number {
  return side === 'black' ? -1 : 1;
}

/** 味方「盾」の前方以外に隣接した味方が敵に取られるとき、50% で着手全体を無効化する。 */
export function tryShieldIntrinsicAbortHostileCapture(input: {
  actorSide: PlayerSide;
  victim: PortedPiece;
  victimRow: number;
  victimCol: number;
  board: InternalBoard;
  rules: RuleSnapshot;
  parseSquare: (square: string) => Square;
}): boolean {
  if (input.victim.side === input.actorSide) return false;

  let hasQualifyingShield = false;
  for (const [square, piece] of input.board.entries()) {
    if (!isShield(piece, resolveDef(input.rules, piece))) continue;
    if (piece.side !== input.victim.side) continue;
    const pos = input.parseSquare(square);
    const dr = input.victimRow - pos.row;
    const dc = input.victimCol - pos.col;
    if (Math.abs(dr) > 1 || Math.abs(dc) > 1 || (dr === 0 && dc === 0)) continue;
    const fwdRow = pos.row + shieldForwardRowDelta(piece.side);
    if (input.victimRow === fwdRow && input.victimCol === pos.col) continue;
    hasQualifyingShield = true;
    break;
  }
  if (!hasQualifyingShield) return false;
  return Math.random() < SHIELD_ABORT_PROC_CHANCE;
}

export function tryOboroEvadeCapture(input: {
  board: InternalBoard;
  rules: RuleSnapshot;
  capturedPiece: PortedPiece;
  captureSquare: string;
  formatSquare: (row: number, col: number) => string;
  parseSquare: (square: string) => Square;
  isInsideBoard: (row: number, col: number) => boolean;
}): string | null {
  const def = resolveDef(input.rules, input.capturedPiece);
  if (!isOboro(input.capturedPiece, def)) return null;
  const hasTrigger = Array.from(input.board.values()).some((piece) => {
    if (piece.side !== input.capturedPiece.side) return false;
    const pDef = resolveDef(input.rules, piece);
    return isDeath(piece, pDef) || isSoul(piece, pDef);
  });
  if (!hasTrigger) return null;
  const empties: string[] = [];
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const square = input.formatSquare(row, col);
      if (!input.board.has(square)) empties.push(square);
    }
  }
  if (empties.length === 0) return null;
  return empties[Math.floor(Math.random() * empties.length)] ?? null;
}

export function shouldRitualSubstitute(input: {
  board: InternalBoard;
  rules: RuleSnapshot;
  capturedPiece: PortedPiece;
  captureSquare: string;
}): boolean {
  const def = resolveDef(input.rules, input.capturedPiece);
  if (isKing(input.capturedPiece, def)) return false;
  if (isRitual(input.capturedPiece, def)) return false;
  return Array.from(input.board.entries()).some(([square, piece]) => {
    if (piece.side !== input.capturedPiece.side) return false;
    if (square === input.captureSquare) return false;
    return isRitual(piece, resolveDef(input.rules, piece));
  });
}

export function consumeRitualSubstitute(input: {
  board: InternalBoard;
  rules: RuleSnapshot;
  defenderSide: PlayerSide;
  excludeSquare: string;
}): boolean {
  for (const [square, piece] of input.board.entries()) {
    if (piece.side !== input.defenderSide) continue;
    if (square === input.excludeSquare) continue;
    if (!isRitual(piece, resolveDef(input.rules, piece))) continue;
    input.board.delete(square);
    return true;
  }
  return false;
}

export function applyCapturedVictimEffects(input: {
  board: InternalBoard;
  rules: RuleSnapshot;
  skillState: SkillState;
  actorSide: PlayerSide;
  capturedPiece: PortedPiece;
  captureSquare: string;
  moverSquare: string;
  parseSquare: (square: string) => Square;
  formatSquare: (row: number, col: number) => string;
  isInsideBoard: (row: number, col: number) => boolean;
}): void {
  const def = resolveDef(input.rules, input.capturedPiece);
  const moverPos = input.parseSquare(input.moverSquare);

  if (isDisease(input.capturedPiece, def)) {
    input.skillState.piece_statuses.push({
      row: moverPos.row,
      col: moverPos.col,
      side: input.actorSide,
      status_type: 'stun',
      remaining_turns: 3,
    });
  }
  if (isDeath(input.capturedPiece, def)) {
    input.skillState.piece_statuses.push({
      row: moverPos.row,
      col: moverPos.col,
      side: input.actorSide,
      status_type: 'death_curse',
      remaining_turns: 5,
    });
  }
  if (isAbyss(input.capturedPiece, def)) {
    input.skillState.piece_statuses.push({
      row: moverPos.row,
      col: moverPos.col,
      side: input.actorSide,
      status_type: 'abyss_stun',
      remaining_turns: 3,
    });
  }
  if (isHole(input.capturedPiece, def)) {
    const center = input.parseSquare(input.captureSquare);
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const row = center.row + dr;
        const col = center.col + dc;
        if (!input.isInsideBoard(row, col)) continue;
        const square = input.formatSquare(row, col);
        if (input.board.has(square)) continue;
        input.skillState.board_hazards.push({
          row,
          col,
          hazard_type: 'pit_cell',
          affects_side: 'both',
          remaining_turns: 4,
        });
      }
    }
  }
}

export function applyKatanaSideCaptures(input: {
  board: InternalBoard;
  rules: RuleSnapshot;
  hands: InternalHands;
  actorSide: PlayerSide;
  movedPiece: PortedPiece;
  moveFrom: string;
  moveTo: string;
  didCapture: boolean;
  parseSquare: (square: string) => Square;
  formatSquare: (row: number, col: number) => string;
  isInsideBoard: (row: number, col: number) => boolean;
  capturedToHandCode: (piece: PortedPiece) => string;
  incrementHand: (side: PlayerSide, code: string) => void;
}): boolean {
  const def = resolveDef(input.rules, input.movedPiece);
  if (!isKatana(input.movedPiece, def) || !input.didCapture) return false;
  const from = input.parseSquare(input.moveFrom);
  const to = input.parseSquare(input.moveTo);
  const forwardDr = input.actorSide === 'black' ? -1 : 1;
  if (to.col !== from.col || to.row !== from.row + forwardDr) return false;

  let swept = false;
  for (const dc of [-1, 1]) {
    const col = to.col + dc;
    const row = to.row;
    if (!input.isInsideBoard(row, col)) continue;
    const square = input.formatSquare(row, col);
    const target = input.board.get(square);
    if (!target || target.side === input.actorSide) continue;
    const tDef = resolveDef(input.rules, target);
    if (isArmor(target, tDef)) continue;
    if (target.code === 'OU') continue;
    input.board.delete(square);
    input.incrementHand(input.actorSide, input.capturedToHandCode(target));
    swept = true;
  }
  return swept;
}

export function applyCookingCaptureSummon(input: {
  board: InternalBoard;
  rules: RuleSnapshot;
  skillState: SkillState;
  actorSide: PlayerSide;
  movedPiece: PortedPiece;
  didCapture: boolean;
  formatSquare: (row: number, col: number) => string;
  isInsideBoard: (row: number, col: number) => boolean;
}): boolean {
  if (!input.didCapture) return false;
  const def = resolveDef(input.rules, input.movedPiece);
  let summonCode: string | null = null;
  if (isSear(input.movedPiece, def)) summonCode = 'ENN';
  else if (isStew(input.movedPiece, def)) summonCode = 'FIR';
  else if (isSaute(input.movedPiece, def)) summonCode = Math.random() < 0.5 ? 'ENN' : 'FIR';
  if (!summonCode) return false;

  const empties: string[] = [];
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const square = input.formatSquare(row, col);
      if (input.board.has(square)) continue;
      if (isCellBlockedByHazard(input.skillState, row, col)) continue;
      empties.push(square);
    }
  }
  const target = empties[Math.floor(Math.random() * empties.length)];
  if (!target) return false;
  input.board.set(target, { side: input.actorSide, code: summonCode, promoted: false });
  return true;
}

export function applyDeathCurseExpirations(input: {
  board: InternalBoard;
  skillState: SkillState;
}): boolean {
  const toRemove = new Set<string>();
  const survivors: Record<string, unknown>[] = [];
  for (const entry of input.skillState.piece_statuses) {
    const statusType = String(entry.status_type ?? entry.statusType ?? '');
    const remaining = Number(entry.remaining_turns ?? entry.remainingTurns ?? 0);
    if (statusType === 'death_curse' && remaining <= 0) {
      const side = String(entry.side ?? 'black') === 'white' ? 'white' : 'black';
      const row = Number(entry.row);
      const col = Number(entry.col);
      if (Number.isFinite(row) && Number.isFinite(col)) {
        toRemove.add(`${side}:${row}:${col}`);
      }
      continue;
    }
    survivors.push(entry);
  }
  if (toRemove.size === 0) return false;
  input.skillState.piece_statuses = survivors;
  for (const [square, piece] of Array.from(input.board.entries())) {
    const pos = parseSquareSimple(square);
    if (toRemove.has(`${piece.side}:${pos.row}:${pos.col}`)) {
      input.board.delete(square);
    }
  }
  return true;
}

function isCellBlockedByHazard(skillState: SkillState, row: number, col: number): boolean {
  return skillState.board_hazards.some((entry) => {
    const type = String(entry.hazard_type ?? entry.hazardType ?? '');
    if (type !== 'rock_obstacle' && type !== 'pit_cell') return false;
    const rem = Number(entry.remaining_turns ?? entry.remainingTurns ?? 0);
    if (rem <= 0) return false;
    return Number(entry.row) === row && Number(entry.col) === col;
  });
}

function parseSquareSimple(square: string): Square {
  const RANKS = 'abcdefghi';
  const file = Number.parseInt(square[0] ?? '', 10);
  const rank = square[1] ?? '';
  return { row: RANKS.indexOf(rank), col: 9 - file };
}

export function applySatoriHeartFromNotation(input: {
  board: InternalBoard;
  rules: RuleSnapshot;
  skillState: SkillState;
  actorSide: PlayerSide;
  movedPiece: PortedPiece;
  notation: string | null;
  parseSquare: (square: string) => Square;
  formatSquare: (row: number, col: number) => string;
}): boolean {
  if (!input.notation) return false;
  const def = resolveDef(input.rules, input.movedPiece);
  const satori = input.notation.match(/^satori_stun:(\d+):(\d+)$/i);
  if (satori && isSatori(input.movedPiece, def)) {
    const row = Number(satori[1]);
    const col = Number(satori[2]);
    const square = input.formatSquare(row, col);
    const target = input.board.get(square);
    if (!target || target.side === input.actorSide || target.code === 'OU') return false;
    input.skillState.piece_statuses.push({
      row,
      col,
      side: target.side,
      status_type: 'stun',
      remaining_turns: 2,
    });
    return true;
  }
  const heart = input.notation.match(/^heart_protect:(\d+):(\d+)$/i);
  if (heart && isHeart(input.movedPiece, def)) {
    const row = Number(heart[1]);
    const col = Number(heart[2]);
    const square = input.formatSquare(row, col);
    const target = input.board.get(square);
    if (!target || target.side !== input.actorSide || target.code === 'OU') return false;
    input.skillState.piece_defenses.push({
      row,
      col,
      side: target.side,
      mode: 'immunity',
      remaining_turns: 2,
    });
    return true;
  }
  return false;
}

export function applySealPassiveImmobilization(input: {
  board: InternalBoard;
  rules: RuleSnapshot;
  skillState: SkillState;
  formatSquare: (row: number, col: number) => string;
  parseSquare: (square: string) => Square;
}): void {
  input.skillState.piece_statuses = input.skillState.piece_statuses.filter(
    (entry) => asString(entry.status_type ?? entry.statusType) !== 'seal_immobilize',
  );
  for (const [square, piece] of input.board.entries()) {
    const def = resolveDef(input.rules, piece);
    if (!isSeal(piece, def)) continue;
    const center = input.parseSquare(square);
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        if (Math.abs(dr) + Math.abs(dc) !== 1) continue;
        const row = center.row + dr;
        const col = center.col + dc;
        if (row < 0 || row > 8 || col < 0 || col > 8) continue;
        const targetSquare = input.formatSquare(row, col);
        const target = input.board.get(targetSquare);
        if (!target || target.side === piece.side) continue;
        if (target.code === 'OU') continue;
        input.skillState.piece_statuses.push({
          row,
          col,
          side: target.side,
          status_type: 'seal_immobilize',
          remaining_turns: 1,
        });
      }
    }
  }
}

function asString(raw: unknown): string | null {
  return typeof raw === 'string' ? raw : null;
}

export function moveGearFollowLeader(input: {
  board: InternalBoard;
  skillState: SkillState;
  actorSide: PlayerSide;
  fromSquare: string;
  toSquare: string;
  rules: RuleSnapshot;
  parseSquare: (square: string) => Square;
  formatSquare: (row: number, col: number) => string;
  isInsideBoard: (row: number, col: number) => boolean;
  moveAttachedSkillState: (
    skillState: SkillState,
    side: PlayerSide,
    from: string,
    to: string,
  ) => void;
}): boolean {
  if (!input.fromSquare) return false;
  const from = input.parseSquare(input.fromSquare);
  const to = input.parseSquare(input.toSquare);
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  if (dr === 0 && dc === 0) return false;
  let moved = false;
  for (const [square, piece] of Array.from(input.board.entries())) {
    if (piece.side !== input.actorSide) continue;
    if (!isGear(piece, resolveDef(input.rules, piece))) continue;
    const pos = input.parseSquare(square);
    if (Math.abs(pos.row - from.row) > 1 || Math.abs(pos.col - from.col) > 1) continue;
    if (pos.row === from.row && pos.col === from.col) continue;
    const destRow = pos.row + dr;
    const destCol = pos.col + dc;
    if (!input.isInsideBoard(destRow, destCol)) continue;
    const dest = input.formatSquare(destRow, destCol);
    if (input.board.has(dest)) continue;
    input.board.delete(square);
    input.board.set(dest, piece);
    input.moveAttachedSkillState(input.skillState, piece.side, square, dest);
    moved = true;
  }
  return moved;
}

function isGear(piece: PortedPiece, def: ReturnType<typeof resolveDef>): boolean {
  return def?.char === '歯' || piece.code.toUpperCase().includes('GEAR');
}
