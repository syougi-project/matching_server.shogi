import type { MoveVector, PieceDefinition, PlayerSide, RuleSnapshot } from '@/types/domain';
import {
  gameCode,
  isArmor,
  isKing,
  isSaint,
  isMedicine,
  resolveDef,
  type PortedPiece,
} from '@/game/ported-app-piece-code';

export type RemainingSquare = { row: number; col: number };

export type RemainingBoard = Map<string, PortedPiece & { pigInheritedCode?: string; pigInheritedPromoted?: boolean }>;

const CONCAVE_SLIDE_VECTORS: MoveVector[] = [
  { dx: -1, dy: -1, maxStep: 9 },
  { dx: 1, dy: -1, maxStep: 9 },
  { dx: -1, dy: 0, maxStep: 9 },
  { dx: 1, dy: 0, maxStep: 9 },
  { dx: 0, dy: 1, maxStep: 9 },
  { dx: -1, dy: 1, maxStep: 9 },
  { dx: 1, dy: 1, maxStep: 9 },
];

const CONCAVE_PIERCE_DIRS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
  [-1, 1],
  [1, 1],
];

export const GIANT_BOARD_MOVE_NOTATION = 'giant_2x2_ortho';

export function isMirror(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = gameCode(piece, def);
  const char = def?.char ?? '';
  return code === 'MIRROR' || char === '鏡' || char === '映' || code === 'EI' || code === 'KAGAMI';
}

export function isMachine(piece: PortedPiece, def: PieceDefinition | null): boolean {
  return gameCode(piece, def) === 'MACHINE' || def?.char === '機';
}

export function isBook(piece: PortedPiece, def: PieceDefinition | null): boolean {
  return gameCode(piece, def) === 'BOOK' || def?.char === '書';
}

export function isPig(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'PIG' || def?.char === '豚' || code.includes('3EFA5702E75B');
}

export function isConcave(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return (
    gameCode(piece, def) === 'CONCAVE' ||
    def?.char === '凹' ||
    code.includes('CONCAVE') ||
    code.includes('48204DCCFA56')
  );
}

export function isConvex(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return (
    gameCode(piece, def) === 'CONVEX' ||
    def?.char === '凸' ||
    code.includes('CONVEX') ||
    code.includes('94B641477E72')
  );
}

export function isGiant(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'GIANT' || def?.char === '巨' || code.includes('C4AEB81F3634');
}

export function isHik(piece: PortedPiece, def: PieceDefinition | null): boolean {
  return gameCode(piece, def) === 'HIK' || def?.char === '光';
}

export function isYang(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'YANG' || def?.char === '陽' || code.includes('313B9456C8AC');
}

export function isYin(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'YIN' || def?.char === '陰' || code.includes('A67CE76969F7');
}

export function isCherry(piece: PortedPiece, def: PieceDefinition | null): boolean {
  const code = piece.code.toUpperCase();
  return gameCode(piece, def) === 'CHERRY' || def?.char === '桜' || code.includes('124C31EA5D7A');
}

export function giantAnchorFootprint(anchorRow: number, anchorCol: number): RemainingSquare[] {
  return [
    { row: anchorRow, col: anchorCol },
    { row: anchorRow + 1, col: anchorCol },
    { row: anchorRow, col: anchorCol + 1 },
    { row: anchorRow + 1, col: anchorCol + 1 },
  ].filter((c) => c.row >= 0 && c.row <= 8 && c.col >= 0 && c.col <= 8);
}

export function isValidGiantAnchor(anchorRow: number, anchorCol: number): boolean {
  return anchorRow >= 0 && anchorCol >= 0 && anchorRow + 1 <= 8 && anchorCol + 1 <= 8;
}

export function findOccupantAt(
  board: RemainingBoard,
  rules: RuleSnapshot,
  row: number,
  col: number,
  formatSquare: (row: number, col: number) => string,
): { square: string; piece: PortedPiece } | null {
  const direct = board.get(formatSquare(row, col));
  if (direct) return { square: formatSquare(row, col), piece: direct };
  for (const [square, piece] of board.entries()) {
    const def = resolveDef(rules, piece);
    if (!isGiant(piece, def)) continue;
    const pos = parseSquareFromKey(square);
    if (giantAnchorFootprint(pos.row, pos.col).some((c) => c.row === row && c.col === col)) {
      return { square, piece };
    }
  }
  return null;
}

function parseSquareFromKey(square: string): RemainingSquare {
  const col = 9 - Number.parseInt(square[0] ?? '0', 10);
  const row = 'abcdefghi'.indexOf((square[1] ?? 'a').toLowerCase());
  return { row, col };
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectMirrorTarget(
  moveCount: number,
  mover: RemainingSquare & { side: PlayerSide },
  candidates: Array<RemainingSquare & { side: PlayerSide }>,
): (RemainingSquare & { side: PlayerSide }) | null {
  if (candidates.length === 0) return null;
  const seed = `${moveCount}:${mover.row}:${mover.col}:${mover.side}`;
  const idx = stableHash(seed) % candidates.length;
  return candidates[idx] ?? null;
}

export function pickMachineDonorAlly(
  board: RemainingBoard,
  rules: RuleSnapshot,
  machineSquare: string,
  machine: PortedPiece,
  formatSquare: (row: number, col: number) => string,
): { square: string; piece: PortedPiece } | null {
  const pos = parseSquareFromKey(machineSquare);
  const left = findOccupantAt(board, rules, pos.row, pos.col - 1, formatSquare);
  const right = findOccupantAt(board, rules, pos.row, pos.col + 1, formatSquare);
  if (left && left.piece.side === machine.side) return left;
  if (right && right.piece.side === machine.side) return right;
  return null;
}

export function resolvePigInheritedPiece(
  piece: PortedPiece & { pigInheritedCode?: string; pigInheritedPromoted?: boolean },
): PortedPiece | null {
  if (!isPig(piece, null)) return null;
  const inherited = piece.pigInheritedCode?.trim();
  if (!inherited) return null;
  const synthetic: PortedPiece = {
    side: piece.side,
    code: inherited.toUpperCase(),
    promoted: piece.pigInheritedPromoted ?? false,
  };
  if (isBook(synthetic, null)) return null;
  return synthetic;
}

function isKnightLeapVector(dx: number, dy: number): boolean {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  return (adx === 2 && ady === 1) || (adx === 1 && ady === 2);
}

export function applySaintAdjacentMoveRangeBuff(vectors: MoveVector[]): MoveVector[] {
  return vectors.map((v) => ({
    ...v,
    maxStep: Math.max(1, (Number(v.maxStep) || 1) + 1),
  }));
}

export function applyMedicineAdjacentMoveRangeBuff(vectors: MoveVector[]): MoveVector[] {
  return vectors.map((v) => ({
    ...v,
    maxStep: Math.max(1, (Number(v.maxStep) || 1) + 1),
  }));
}

export function applyCherryRowMoveRangeBuff(vectors: MoveVector[]): MoveVector[] {
  return vectors.map((v) => {
    if (isKnightLeapVector(v.dx, v.dy)) return v;
    return { ...v, maxStep: Math.max(1, (Number(v.maxStep) || 1) + 1) };
  });
}

export function hasOrthogonalAdjacentAllySaint(
  board: RemainingBoard,
  rules: RuleSnapshot,
  square: string,
  piece: PortedPiece,
  formatSquare: (row: number, col: number) => string,
): boolean {
  const pos = parseSquareFromKey(square);
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    const occ = findOccupantAt(board, rules, pos.row + dr, pos.col + dc, formatSquare);
    if (occ && occ.piece.side === piece.side && isSaint(occ.piece, resolveDef(rules, occ.piece))) {
      return true;
    }
  }
  return false;
}

export function hasAdjacentAllyMedicine(
  board: RemainingBoard,
  rules: RuleSnapshot,
  square: string,
  piece: PortedPiece,
  formatSquare: (row: number, col: number) => string,
): boolean {
  const pos = parseSquareFromKey(square);
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const occ = findOccupantAt(board, rules, pos.row + dr, pos.col + dc, formatSquare);
      if (occ && occ.piece.side === piece.side && isMedicine(occ.piece, resolveDef(rules, occ.piece))) {
        return true;
      }
    }
  }
  return false;
}

export function hasSameRowAllyCherryBuff(
  board: RemainingBoard,
  rules: RuleSnapshot,
  square: string,
  piece: PortedPiece,
  formatSquare: (row: number, col: number) => string,
): boolean {
  if (isCherry(piece, resolveDef(rules, piece))) return false;
  const pos = parseSquareFromKey(square);
  for (const [sq, ally] of board.entries()) {
    if (ally.side !== piece.side) continue;
    const allyPos = parseSquareFromKey(sq);
    if (allyPos.row !== pos.row) continue;
    if (isCherry(ally, resolveDef(rules, ally))) return true;
  }
  return false;
}

function allyYinSharesRowOrColumnWithYang(
  board: RemainingBoard,
  rules: RuleSnapshot,
  yangSquare: string,
  yang: PortedPiece,
  formatSquare: (row: number, col: number) => string,
): boolean {
  const yangPos = parseSquareFromKey(yangSquare);
  for (const [sq, p] of board.entries()) {
    if (sq === yangSquare) continue;
    if (p.side !== yang.side) continue;
    if (!isYin(p, resolveDef(rules, p))) continue;
    const pos = parseSquareFromKey(sq);
    if (pos.row === yangPos.row || pos.col === yangPos.col) return true;
  }
  return false;
}

function allyYangSharesRowOrColumnWithYin(
  board: RemainingBoard,
  rules: RuleSnapshot,
  yinSquare: string,
  yin: PortedPiece,
  formatSquare: (row: number, col: number) => string,
): boolean {
  const yinPos = parseSquareFromKey(yinSquare);
  for (const [sq, p] of board.entries()) {
    if (sq === yinSquare) continue;
    if (p.side !== yin.side) continue;
    if (!isYang(p, resolveDef(rules, p))) continue;
    const pos = parseSquareFromKey(sq);
    if (pos.row === yinPos.row || pos.col === yinPos.col) return true;
  }
  return false;
}

export function isYangBondProtectedFromCapture(
  board: RemainingBoard,
  rules: RuleSnapshot,
  targetSquare: string,
  target: PortedPiece,
  formatSquare: (row: number, col: number) => string,
): boolean {
  if (!isYang(target, resolveDef(rules, target))) return false;
  return allyYinSharesRowOrColumnWithYang(board, rules, targetSquare, target, formatSquare);
}

export function isYinBondProtectedFromCapture(
  board: RemainingBoard,
  rules: RuleSnapshot,
  targetSquare: string,
  target: PortedPiece,
  formatSquare: (row: number, col: number) => string,
): boolean {
  if (!isYin(target, resolveDef(rules, target))) return false;
  return allyYangSharesRowOrColumnWithYin(board, rules, targetSquare, target, formatSquare);
}

export function isBondProtectedFromCapture(
  board: RemainingBoard,
  rules: RuleSnapshot,
  targetSquare: string,
  target: PortedPiece,
  formatSquare: (row: number, col: number) => string,
): boolean {
  return (
    isYangBondProtectedFromCapture(board, rules, targetSquare, target, formatSquare) ||
    isYinBondProtectedFromCapture(board, rules, targetSquare, target, formatSquare)
  );
}

export function resolveConcaveVectors(): MoveVector[] {
  return CONCAVE_SLIDE_VECTORS.map((v) => ({ ...v }));
}

export function generateConcaveEdgePierceTargets(input: {
  board: RemainingBoard;
  rules: RuleSnapshot;
  side: PlayerSide;
  source: RemainingSquare;
  formatSquare: (row: number, col: number) => string;
  orientRowDelta: (side: PlayerSide, delta: number) => number;
}): RemainingSquare[] {
  const out: RemainingSquare[] = [];
  for (const [tvx, tvy] of CONCAVE_PIERCE_DIRS) {
    const dc = tvx;
    const dr = input.orientRowDelta(input.side, tvy);
    let er = input.source.row;
    let ec = input.source.col;
    for (;;) {
      const nr = er + dr;
      const nc = ec + dc;
      if (nr < 0 || nr > 8 || nc < 0 || nc > 8) break;
      er = nr;
      ec = nc;
    }
    if (er === input.source.row && ec === input.source.col) continue;
    if (input.board.get(input.formatSquare(er, ec))) continue;
    let r = input.source.row + dr;
    let c = input.source.col + dc;
    let ok = true;
    while (true) {
      const occ = findOccupantAt(input.board, input.rules, r, c, input.formatSquare);
      if (occ && occ.piece.side !== input.side) {
        ok = false;
        break;
      }
      if (r === er && c === ec) break;
      r += dr;
      c += dc;
    }
    if (ok) out.push({ row: er, col: ec });
  }
  return out;
}

export function generateReflectiveTargets(input: {
  board: RemainingBoard;
  rules: RuleSnapshot;
  source: RemainingSquare;
  side: PlayerSide;
  formatSquare: (row: number, col: number) => string;
}): RemainingSquare[] {
  const out: RemainingSquare[] = [];
  const seen = new Set<string>();
  const starts: [number, number][] = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  for (const [startDr, startDc] of starts) {
    let r = input.source.row;
    let c = input.source.col;
    let dr = startDr;
    let dc = startDc;
    const seenState = new Set<string>();
    for (let step = 0; step < 256; step += 1) {
      const stateKey = `${r}:${c}:${dr}:${dc}`;
      if (seenState.has(stateKey)) break;
      seenState.add(stateKey);
      let nr = r + dr;
      let nc = c + dc;
      if (nr < 0 || nr > 8) {
        dr *= -1;
        nr = r + dr;
      }
      if (nc < 0 || nc > 8) {
        dc *= -1;
        nc = c + dc;
      }
      if (nr < 0 || nr > 8 || nc < 0 || nc > 8) break;
      const occ = findOccupantAt(input.board, input.rules, nr, nc, input.formatSquare);
      if (occ) {
        const def = resolveDef(input.rules, occ.piece);
        if (occ.piece.side !== input.side && !isGiant(occ.piece, def)) {
          const key = `${nr}:${nc}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push({ row: nr, col: nc });
          }
        }
        break;
      }
      const key = `${nr}:${nc}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ row: nr, col: nc });
      }
      r = nr;
      c = nc;
    }
  }
  return out;
}

export function generateGiantOrthogonalTargets(input: {
  board: RemainingBoard;
  rules: RuleSnapshot;
  actorSide: PlayerSide;
  from: RemainingSquare;
  formatSquare: (row: number, col: number) => string;
  canCaptureAt: (row: number, col: number, occupant: PortedPiece) => boolean;
}): RemainingSquare[] {
  const { from, actorSide } = input;
  if (!isValidGiantAnchor(from.row, from.col)) return [];
  const deltas = [-2, -1, 1, 2];
  const candidateAnchors: RemainingSquare[] = [];
  for (const d of deltas) {
    candidateAnchors.push({ row: from.row + d, col: from.col });
    candidateAnchors.push({ row: from.row, col: from.col + d });
  }
  const seen = new Set<string>();
  const out: RemainingSquare[] = [];
  for (const to of candidateAnchors) {
    if (!isValidGiantAnchor(to.row, to.col)) continue;
    if (to.row === from.row && to.col === from.col) continue;
    const step = Math.abs(to.row - from.row) + Math.abs(to.col - from.col);
    if (step === 0 || step > 2 || (to.row !== from.row && to.col !== from.col)) continue;
    const key = `${to.row}:${to.col}`;
    if (seen.has(key)) continue;
    const destCells = giantAnchorFootprint(to.row, to.col);
    let blocked = false;
    for (const c of destCells) {
      const occ = findOccupantAt(input.board, input.rules, c.row, c.col, input.formatSquare);
      if (!occ) continue;
      if (occ.piece.side === actorSide) {
        const isSelf = c.row === from.row && c.col === from.col;
        if (!isSelf) {
          blocked = true;
          break;
        }
      }
    }
    if (blocked) continue;
    for (const c of destCells) {
      const occ = findOccupantAt(input.board, input.rules, c.row, c.col, input.formatSquare);
      if (!occ || occ.piece.side === actorSide) continue;
      const def = resolveDef(input.rules, occ.piece);
      if (isArmor(occ.piece, def)) {
        blocked = true;
        break;
      }
      if (isKing(occ.piece, def)) {
        blocked = true;
        break;
      }
      if (isGiant(occ.piece, def)) {
        blocked = true;
        break;
      }
      if (!input.canCaptureAt(c.row, c.col, occ.piece)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    seen.add(key);
    out.push(to);
  }
  return out;
}

export function listAdjacentAllies(
  board: RemainingBoard,
  rules: RuleSnapshot,
  square: string,
  piece: PortedPiece,
  formatSquare: (row: number, col: number) => string,
): Array<{ square: string; piece: PortedPiece }> {
  const pos = parseSquareFromKey(square);
  const out: Array<{ square: string; piece: PortedPiece }> = [];
  for (const [sq, ally] of board.entries()) {
    if (ally.side !== piece.side) continue;
    if (sq === square) continue;
    const allyPos = parseSquareFromKey(sq);
    const dr = Math.abs(allyPos.row - pos.row);
    const dc = Math.abs(allyPos.col - pos.col);
    if (dr <= 1 && dc <= 1) out.push({ square: sq, piece: ally });
  }
  return out;
}

export function applyAuraVectorBuffs(input: {
  board: RemainingBoard;
  rules: RuleSnapshot;
  square: string;
  piece: PortedPiece;
  vectors: MoveVector[];
  formatSquare: (row: number, col: number) => string;
}): MoveVector[] {
  let vectors = input.vectors;
  if (hasOrthogonalAdjacentAllySaint(input.board, input.rules, input.square, input.piece, input.formatSquare)) {
    vectors = applySaintAdjacentMoveRangeBuff(vectors);
  }
  if (hasAdjacentAllyMedicine(input.board, input.rules, input.square, input.piece, input.formatSquare)) {
    vectors = applyMedicineAdjacentMoveRangeBuff(vectors);
  }
  if (hasSameRowAllyCherryBuff(input.board, input.rules, input.square, input.piece, input.formatSquare)) {
    vectors = applyCherryRowMoveRangeBuff(vectors);
  }
  return vectors;
}

export function mirrorEnemyCandidates(
  board: RemainingBoard,
  rules: RuleSnapshot,
  actorSide: PlayerSide,
): Array<{ square: string; piece: PortedPiece; pos: RemainingSquare }> {
  const out: Array<{ square: string; piece: PortedPiece; pos: RemainingSquare }> = [];
  for (const [square, piece] of board.entries()) {
    if (piece.side === actorSide) continue;
    const def = resolveDef(rules, piece);
    if (isMirror(piece, def)) continue;
    out.push({ square, piece, pos: parseSquareFromKey(square) });
  }
  return out;
}

export function encodePigInheritedSuffix(piece: PortedPiece & { pigInheritedCode?: string; pigInheritedPromoted?: boolean }): string {
  if (!piece.pigInheritedCode?.trim()) return '';
  return `>${piece.pigInheritedCode.trim().toUpperCase()}${piece.pigInheritedPromoted ? '+' : ''}`;
}

export function decodePigInheritedSuffix(rawCode: string): {
  code: string;
  pigInheritedCode?: string;
  pigInheritedPromoted?: boolean;
} {
  const idx = rawCode.indexOf('>');
  if (idx < 0) return { code: rawCode };
  const base = rawCode.slice(0, idx);
  let inherited = rawCode.slice(idx + 1);
  const promoted = inherited.endsWith('+');
  if (promoted) inherited = inherited.slice(0, -1);
  return {
    code: base,
    pigInheritedCode: inherited || undefined,
    pigInheritedPromoted: promoted || undefined,
  };
}
