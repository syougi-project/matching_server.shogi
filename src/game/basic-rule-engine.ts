import type { ApplyMoveInput, ApplyMoveResult, RuleEngine } from '@/game/rule-engine';
import type {
  GameSnapshot,
  MovePayload,
  PieceDefinition,
  PlayerSide,
  RuleSnapshot,
  SkillDefinition,
} from '@/types/domain';

type InternalPiece = {
  side: PlayerSide;
  code: string;
  promoted: boolean;
};

type InternalBoard = Map<string, InternalPiece>;

type InternalHands = Record<PlayerSide, Record<string, number>>;

type InternalGameState = {
  board: InternalBoard;
  hands: InternalHands;
  turn: PlayerSide;
};

type NormalizedMove = {
  from: string | null;
  to: string;
  piece: string;
  promote: boolean;
  drop: boolean;
};

type AppliedStateResult =
  | {
      ok: true;
      board: InternalBoard;
      hands: InternalHands;
      skillTriggered: boolean;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

type MovementPattern = {
  rowDelta: number;
  colDelta: number;
  maxStep: number;
  canJump: boolean;
};

type SkillContext = {
  board: InternalBoard;
  hands: InternalHands;
  actorSide: PlayerSide;
  movedPiece: InternalPiece;
  move: NormalizedMove;
  capturedPiece: InternalPiece | null;
};

const BOARD_SIZE = 9;
const RANKS = 'abcdefghi';
const GOLD_PROMOTED_CODES = new Set(['FU', 'KY', 'KE', 'GI']);
const PROMOTABLE_DEFAULT = new Set(['FU', 'KY', 'KE', 'GI', 'KA', 'HI']);
const STANDARD_INITIAL_LAYOUT: Array<{ square: string; side: PlayerSide; code: string }> = [
  { square: '9a', side: 'white', code: 'KY' },
  { square: '8a', side: 'white', code: 'KE' },
  { square: '7a', side: 'white', code: 'GI' },
  { square: '6a', side: 'white', code: 'KI' },
  { square: '5a', side: 'white', code: 'OU' },
  { square: '4a', side: 'white', code: 'KI' },
  { square: '3a', side: 'white', code: 'GI' },
  { square: '2a', side: 'white', code: 'KE' },
  { square: '1a', side: 'white', code: 'KY' },
  { square: '8b', side: 'white', code: 'HI' },
  { square: '2b', side: 'white', code: 'KA' },
  { square: '9c', side: 'white', code: 'FU' },
  { square: '8c', side: 'white', code: 'FU' },
  { square: '7c', side: 'white', code: 'FU' },
  { square: '6c', side: 'white', code: 'FU' },
  { square: '5c', side: 'white', code: 'FU' },
  { square: '4c', side: 'white', code: 'FU' },
  { square: '3c', side: 'white', code: 'FU' },
  { square: '2c', side: 'white', code: 'FU' },
  { square: '1c', side: 'white', code: 'FU' },
  { square: '9g', side: 'black', code: 'FU' },
  { square: '8g', side: 'black', code: 'FU' },
  { square: '7g', side: 'black', code: 'FU' },
  { square: '6g', side: 'black', code: 'FU' },
  { square: '5g', side: 'black', code: 'FU' },
  { square: '4g', side: 'black', code: 'FU' },
  { square: '3g', side: 'black', code: 'FU' },
  { square: '2g', side: 'black', code: 'FU' },
  { square: '1g', side: 'black', code: 'FU' },
  { square: '8h', side: 'black', code: 'KA' },
  { square: '2h', side: 'black', code: 'HI' },
  { square: '9i', side: 'black', code: 'KY' },
  { square: '8i', side: 'black', code: 'KE' },
  { square: '7i', side: 'black', code: 'GI' },
  { square: '6i', side: 'black', code: 'KI' },
  { square: '5i', side: 'black', code: 'OU' },
  { square: '4i', side: 'black', code: 'KI' },
  { square: '3i', side: 'black', code: 'GI' },
  { square: '2i', side: 'black', code: 'KE' },
  { square: '1i', side: 'black', code: 'KY' },
];

export class BasicRuleEngine implements RuleEngine {
  createInitialGame(rules: RuleSnapshot): GameSnapshot {
    const boardState = createInitialBoardState(rules);
    return {
      boardState,
      handsState: { black: {}, white: {} },
      turn: 'black',
      moveCount: 0,
      version: 1,
    };
  }

  applyMove(input: ApplyMoveInput): ApplyMoveResult {
    if (input.game.turn !== input.actorSide) {
      return {
        ok: false,
        code: 'NOT_YOUR_TURN',
        message: 'The move does not belong to the current player turn.',
      };
    }

    if (!input.move.to || !input.move.piece) {
      return {
        ok: false,
        code: 'INVALID_MOVE',
        message: 'Move payload is missing required fields.',
      };
    }

    const state = parseGameState(input.game);
    const move = normalizeMove(input.move);
    const applied = applyLegalMove(state, input.rules, input.actorSide, move);
    if (!applied.ok) {
      return applied;
    }

    const nextTurn = opposite(input.actorSide);
    const nextState: InternalGameState = {
      board: applied.board,
      hands: applied.hands,
      turn: nextTurn,
    };
    const nextGame: GameSnapshot = {
      boardState: serializeBoard(nextState.board),
      handsState: cloneHands(nextState.hands),
      turn: nextTurn,
      moveCount: input.game.moveCount + 1,
      version: input.game.version + 1,
      lastMove: toMovePayload(move),
    };

    const opponentHasKing = findKingSquare(nextState.board, nextTurn) !== null;
    if (!opponentHasKing) {
      return {
        ok: true,
        nextGame,
        finished: { winnerSide: input.actorSide, reason: 'king_capture' },
      };
    }

    const opponentMoves = generateLegalMoves(nextState, input.rules, nextTurn);
    if (opponentMoves.length === 0 && isKingInCheck(nextState.board, input.rules, nextTurn)) {
      return {
        ok: true,
        nextGame,
        finished: { winnerSide: input.actorSide, reason: 'checkmate' },
      };
    }

    return { ok: true, nextGame };
  }
}

function createInitialBoardState(rules: RuleSnapshot): Record<string, string> {
  const board: Record<string, string> = {};
  for (const entry of STANDARD_INITIAL_LAYOUT) {
    if (!rules.piecesByCode[entry.code]) continue;
    board[entry.square] = encodePiece({
      side: entry.side,
      code: entry.code,
      promoted: false,
    });
  }
  return board;
}

function parseGameState(game: GameSnapshot): InternalGameState {
  const board: InternalBoard = new Map();
  for (const [square, raw] of Object.entries(game.boardState)) {
    const piece = decodePiece(raw);
    if (piece) board.set(square, piece);
  }
  return {
    board,
    hands: cloneHands(game.handsState),
    turn: game.turn,
  };
}

function normalizeMove(move: MovePayload): NormalizedMove {
  return {
    from: move.from ?? null,
    to: move.to.trim().toLowerCase(),
    piece: move.piece.trim().toUpperCase().replace(/\+$/, ''),
    promote: move.promote === true,
    drop: move.drop === true || !move.from,
  };
}

function applyLegalMove(
  state: InternalGameState,
  rules: RuleSnapshot,
  actorSide: PlayerSide,
  move: NormalizedMove,
): AppliedStateResult {
  const legalMoves = generateLegalMoves(state, rules, actorSide);
  const matched = legalMoves.find((candidate) => sameMove(candidate, move));
  if (!matched) {
    return {
      ok: false,
      code: 'ILLEGAL_MOVE',
      message: 'Move is not legal in the current position.',
    };
  }

  const next = applyMoveUnchecked(state, rules, actorSide, matched, true);
  return {
    ok: true,
    board: next.board,
    hands: next.hands,
    skillTriggered: next.skillTriggered,
  };
}

function generateLegalMoves(
  state: InternalGameState,
  rules: RuleSnapshot,
  side: PlayerSide,
): NormalizedMove[] {
  const moves: NormalizedMove[] = [];

  for (const [square, piece] of state.board.entries()) {
    if (piece.side !== side) continue;
    const pseudoMoves = generatePseudoMovesForPiece(state.board, rules, square, piece);
    for (const move of pseudoMoves) {
      const next = applyMoveUnchecked(state, rules, side, move, false);
      if (!isKingInCheck(next.board, rules, side)) {
        moves.push(move);
      }
    }
  }

  for (const drop of generateDropMoves(state, rules, side)) {
    const next = applyMoveUnchecked(state, rules, side, drop, false);
    if (!isKingInCheck(next.board, rules, side)) {
      if (drop.piece === 'FU' && isIllegalPawnDropMate(next, rules, opposite(side))) continue;
      moves.push(drop);
    }
  }

  return moves;
}

function generatePseudoMovesForPiece(
  board: InternalBoard,
  rules: RuleSnapshot,
  from: string,
  piece: InternalPiece,
): NormalizedMove[] {
  const definition = resolvePieceDefinition(rules, piece);
  if (!definition) return [];
  const source = parseSquare(from);
  const targets = getMovementTargets(board, piece.side, source, definition, piece.promoted);
  const moves: NormalizedMove[] = [];

  for (const target of targets) {
    const to = formatSquare(target.row, target.col);
    const promotions = promotionOptions(piece, definition, source.row, target.row);
    for (const promote of promotions) {
      moves.push({
        from,
        to,
        piece: piece.code,
        promote,
        drop: false,
      });
    }
  }

  return moves;
}

function generateDropMoves(
  state: InternalGameState,
  rules: RuleSnapshot,
  side: PlayerSide,
): NormalizedMove[] {
  const bag = state.hands[side];
  const moves: NormalizedMove[] = [];

  for (const [pieceCodeRaw, count] of Object.entries(bag)) {
    const pieceCode = pieceCodeRaw.toUpperCase();
    if (count <= 0 || pieceCode === 'OU' || !rules.piecesByCode[pieceCode]) continue;
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const square = formatSquare(row, col);
        if (state.board.has(square)) continue;
        if (!canDropPiece(state.board, state.hands, side, pieceCode, row, col)) continue;
        moves.push({
          from: null,
          to: square,
          piece: pieceCode,
          promote: false,
          drop: true,
        });
      }
    }
  }

  return moves;
}

function canDropPiece(
  board: InternalBoard,
  hands: InternalHands,
  side: PlayerSide,
  pieceCode: string,
  row: number,
  col: number,
) {
  if (!isInsideBoard(row, col)) return false;
  if ((hands[side][pieceCode] ?? 0) <= 0) return false;
  if (board.has(formatSquare(row, col))) return false;
  if ((pieceCode === 'FU' || pieceCode === 'KY') && isDeadEndRow(side, pieceCode, row)) return false;
  if (pieceCode === 'KE' && isDeadEndRow(side, pieceCode, row)) return false;
  if (pieceCode === 'FU' && hasUnpromotedPawnInFile(board, side, col)) return false;
  return true;
}

function getMovementTargets(
  board: InternalBoard,
  side: PlayerSide,
  source: Square,
  definition: PieceDefinition,
  promoted: boolean,
) {
  const targets: Square[] = [];
  const patterns = getPatternsForPiece(definition, promoted);

  for (const pattern of patterns) {
    for (let step = 1; step <= pattern.maxStep; step += 1) {
      const row = source.row + orientRowDelta(side, pattern.rowDelta * step);
      const col = source.col + pattern.colDelta * step;
      if (!isInsideBoard(row, col)) break;
      const square = formatSquare(row, col);
      const occupant = board.get(square);
      if (occupant?.side === side) break;
      targets.push({ row, col });
      if (occupant || !pattern.canJump && pattern.maxStep === 1) break;
      if (occupant || pattern.canJump) {
        if (!occupant) continue;
        break;
      }
    }
  }

  return dedupeSquares(targets);
}

function getPatternsForPiece(definition: PieceDefinition, promoted: boolean): MovementPattern[] {
  if (promoted && GOLD_PROMOTED_CODES.has(definition.pieceCode)) {
    return goldPatterns();
  }
  if (promoted && definition.pieceCode === 'KA') {
    return [...definitionPatterns(definition), ...kingOrthogonalPatterns()];
  }
  if (promoted && definition.pieceCode === 'HI') {
    return [...definitionPatterns(definition), ...kingDiagonalPatterns()];
  }
  return definitionPatterns(definition);
}

function definitionPatterns(definition: PieceDefinition): MovementPattern[] {
  return definition.moveVectors.map((vector) => ({
    rowDelta: vector.dy,
    colDelta: vector.dx,
    maxStep: Math.max(1, vector.maxStep),
    canJump: definition.canJump === true,
  }));
}

function goldPatterns(): MovementPattern[] {
  return [
    { rowDelta: -1, colDelta: -1, maxStep: 1, canJump: false },
    { rowDelta: 0, colDelta: -1, maxStep: 1, canJump: false },
    { rowDelta: 1, colDelta: -1, maxStep: 1, canJump: false },
    { rowDelta: -1, colDelta: 0, maxStep: 1, canJump: false },
    { rowDelta: 1, colDelta: 0, maxStep: 1, canJump: false },
    { rowDelta: 0, colDelta: 1, maxStep: 1, canJump: false },
  ];
}

function kingOrthogonalPatterns(): MovementPattern[] {
  return [
    { rowDelta: 0, colDelta: -1, maxStep: 1, canJump: false },
    { rowDelta: 0, colDelta: 1, maxStep: 1, canJump: false },
    { rowDelta: -1, colDelta: 0, maxStep: 1, canJump: false },
    { rowDelta: 1, colDelta: 0, maxStep: 1, canJump: false },
  ];
}

function kingDiagonalPatterns(): MovementPattern[] {
  return [
    { rowDelta: -1, colDelta: -1, maxStep: 1, canJump: false },
    { rowDelta: 1, colDelta: -1, maxStep: 1, canJump: false },
    { rowDelta: -1, colDelta: 1, maxStep: 1, canJump: false },
    { rowDelta: 1, colDelta: 1, maxStep: 1, canJump: false },
  ];
}

function promotionOptions(
  piece: InternalPiece,
  definition: PieceDefinition,
  fromRow: number,
  toRow: number,
) {
  const promotable = definition.promotable ?? PROMOTABLE_DEFAULT.has(piece.code);
  if (piece.promoted || !promotable) return [false];
  const canPromote = inPromotionZone(piece.side, fromRow) || inPromotionZone(piece.side, toRow);
  const mustPromote = isDeadEndRow(piece.side, piece.code, toRow);
  if (mustPromote) return [true];
  if (canPromote) return [false, true];
  return [false];
}

function applyMoveUnchecked(
  state: InternalGameState,
  rules: RuleSnapshot,
  actorSide: PlayerSide,
  move: NormalizedMove,
  allowSkills: boolean,
) {
  const board = cloneBoard(state.board);
  const hands = cloneHands(state.hands);
  let movedPiece: InternalPiece;
  let capturedPiece: InternalPiece | null = null;

  if (move.drop) {
    decrementHand(hands, actorSide, move.piece);
    movedPiece = { side: actorSide, code: move.piece, promoted: false };
    board.set(move.to, movedPiece);
  } else {
    movedPiece = board.get(move.from ?? '') ?? { side: actorSide, code: move.piece, promoted: false };
    const current = board.get(move.from ?? '');
    if (!current) {
      throw new Error('moving piece not found');
    }
    movedPiece = {
      side: actorSide,
      code: current.code,
      promoted: move.promote || current.promoted,
    };
    capturedPiece = board.get(move.to) ?? null;
    board.delete(move.from ?? '');
    if (capturedPiece && capturedPiece.code !== 'OU') {
      incrementHand(hands, actorSide, capturedPiece.code);
    }
    board.set(move.to, movedPiece);
  }

  let skillTriggered = false;
  if (allowSkills) {
    const applied = applySkills(rules, {
      board,
      hands,
      actorSide,
      movedPiece,
      move,
      capturedPiece,
    });
    skillTriggered = applied;
  }

  return {
    board,
    hands,
    turn: opposite(actorSide),
    skillTriggered,
  };
}

function applySkills(rules: RuleSnapshot, context: SkillContext) {
  const pieceDefs = collectMatchingSkillDefinitions(rules, context.movedPiece);
  let applied = false;

  for (const definition of pieceDefs) {
    const triggerType = definition.trigger.type;
    if (triggerType === 'after_move') {
      for (const effect of definition.effects) {
        if (effect.type === 'send_to_hand') {
          applied = executeAdjacentEnemySendToHand(context, effect.params?.maxTargets) || applied;
        }
      }
    }

    if (triggerType === 'after_capture' && context.capturedPiece) {
      for (const effect of definition.effects) {
        if (effect.type === 'multi_capture') {
          applied = executeAdjacentEnemyCapture(context) || applied;
        }
      }
    }
  }

  return applied;
}

function collectMatchingSkillDefinitions(rules: RuleSnapshot, movedPiece: InternalPiece) {
  return rules.skillDefinitions.filter((definition) => {
    if (definition.pieceCodes?.some((code) => code.toUpperCase() === movedPiece.code)) return true;
    const pieceDef = rules.piecesByCode[movedPiece.code];
    if (!pieceDef) return false;
    return definition.pieceChars?.includes(pieceDef.char) === true;
  });
}

function executeAdjacentEnemySendToHand(context: SkillContext, maxTargetsRaw: unknown) {
  const center = parseSquare(context.move.to);
  const enemy = opposite(context.actorSide);
  const maxTargets =
    typeof maxTargetsRaw === 'number' && Number.isFinite(maxTargetsRaw)
      ? Math.max(1, Math.floor(maxTargetsRaw))
      : 1;

  let removed = 0;
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const row = center.row + dr;
      const col = center.col + dc;
      if (!isInsideBoard(row, col)) continue;
      const square = formatSquare(row, col);
      const target = context.board.get(square);
      if (!target || target.side !== enemy || target.code === 'OU') continue;
      context.board.delete(square);
      incrementHand(context.hands, enemy, target.code);
      removed += 1;
      if (removed >= maxTargets) return true;
    }
  }

  return removed > 0;
}

function executeAdjacentEnemyCapture(context: SkillContext) {
  const center = parseSquare(context.move.to);
  const enemy = opposite(context.actorSide);
  let removed = false;

  for (const dc of [-1, 1]) {
    const row = center.row;
    const col = center.col + dc;
    if (!isInsideBoard(row, col)) continue;
    const square = formatSquare(row, col);
    const target = context.board.get(square);
    if (!target || target.side !== enemy || target.code === 'OU') continue;
    context.board.delete(square);
    incrementHand(context.hands, context.actorSide, target.code);
    removed = true;
  }

  return removed;
}

function isKingInCheck(board: InternalBoard, rules: RuleSnapshot, side: PlayerSide) {
  const kingSquare = findKingSquare(board, side);
  if (!kingSquare) return true;
  return isSquareAttacked(board, rules, kingSquare, opposite(side));
}

function isSquareAttacked(
  board: InternalBoard,
  rules: RuleSnapshot,
  targetSquare: string,
  attacker: PlayerSide,
) {
  for (const [square, piece] of board.entries()) {
    if (piece.side !== attacker) continue;
    const definition = resolvePieceDefinition(rules, piece);
    if (!definition) continue;
    const targets = getMovementTargets(board, attacker, parseSquare(square), definition, piece.promoted);
    if (targets.some((target) => formatSquare(target.row, target.col) === targetSquare)) return true;
  }
  return false;
}

function isIllegalPawnDropMate(state: InternalGameState, rules: RuleSnapshot, defender: PlayerSide) {
  if (!isKingInCheck(state.board, rules, defender)) return false;
  return generateLegalMoves(state, rules, defender).length === 0;
}

function resolvePieceDefinition(rules: RuleSnapshot, piece: InternalPiece) {
  return rules.piecesByCode[piece.code] ?? null;
}

function findKingSquare(board: InternalBoard, side: PlayerSide) {
  for (const [square, piece] of board.entries()) {
    if (piece.side === side && piece.code === 'OU') return square;
  }
  return null;
}

function hasUnpromotedPawnInFile(board: InternalBoard, side: PlayerSide, col: number) {
  for (const [square, piece] of board.entries()) {
    const parsed = parseSquare(square);
    if (parsed.col === col && piece.side === side && piece.code === 'FU' && !piece.promoted) {
      return true;
    }
  }
  return false;
}

function isDeadEndRow(side: PlayerSide, pieceCode: string, row: number) {
  if (pieceCode === 'FU' || pieceCode === 'KY') {
    return (side === 'black' && row === 0) || (side === 'white' && row === 8);
  }
  if (pieceCode === 'KE') {
    return (side === 'black' && row <= 1) || (side === 'white' && row >= 7);
  }
  return false;
}

function inPromotionZone(side: PlayerSide, row: number) {
  return side === 'black' ? row <= 2 : row >= 6;
}

function orientRowDelta(side: PlayerSide, delta: number) {
  return side === 'black' ? delta : -delta;
}

function encodePiece(piece: InternalPiece) {
  return `${piece.side}:${piece.code}${piece.promoted ? '+' : ''}`;
}

function decodePiece(raw: string): InternalPiece | null {
  const [sideRaw, codeRaw] = raw.split(':');
  if ((sideRaw !== 'black' && sideRaw !== 'white') || !codeRaw) return null;
  const promoted = codeRaw.endsWith('+');
  return {
    side: sideRaw,
    code: (promoted ? codeRaw.slice(0, -1) : codeRaw).toUpperCase(),
    promoted,
  };
}

function cloneBoard(board: InternalBoard) {
  return new Map(Array.from(board.entries(), ([square, piece]) => [square, { ...piece }]));
}

function cloneHands(hands: InternalHands): InternalHands {
  return {
    black: { ...hands.black },
    white: { ...hands.white },
  };
}

function serializeBoard(board: InternalBoard): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [square, piece] of board.entries()) {
    out[square] = encodePiece(piece);
  }
  return out;
}

function incrementHand(hands: InternalHands, side: PlayerSide, pieceCode: string) {
  hands[side][pieceCode] = (hands[side][pieceCode] ?? 0) + 1;
}

function decrementHand(hands: InternalHands, side: PlayerSide, pieceCode: string) {
  const current = hands[side][pieceCode] ?? 0;
  if (current <= 1) {
    delete hands[side][pieceCode];
    return;
  }
  hands[side][pieceCode] = current - 1;
}

function sameMove(left: NormalizedMove, right: NormalizedMove) {
  return (
    left.from === right.from &&
    left.to === right.to &&
    left.piece === right.piece &&
    left.promote === right.promote &&
    left.drop === right.drop
  );
}

function toMovePayload(move: NormalizedMove): MovePayload {
  return {
    from: move.from ?? undefined,
    to: move.to,
    piece: move.piece,
    promote: move.promote,
    drop: move.drop,
  };
}

function opposite(side: PlayerSide): PlayerSide {
  return side === 'black' ? 'white' : 'black';
}

function parseSquare(square: string): Square {
  const normalized = square.trim().toLowerCase();
  if (!/^[1-9][a-i]$/.test(normalized)) {
    throw new Error(`invalid square: ${square}`);
  }
  const file = Number.parseInt(normalized[0] ?? '', 10);
  const rank = normalized[1] ?? '';
  return {
    row: RANKS.indexOf(rank),
    col: 9 - file,
  };
}

function formatSquare(row: number, col: number) {
  return `${9 - col}${RANKS[row]}`;
}

function isInsideBoard(row: number, col: number) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function dedupeSquares(squares: Square[]) {
  const seen = new Set<string>();
  const out: Square[] = [];
  for (const square of squares) {
    const key = `${square.row}:${square.col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(square);
  }
  return out;
}

type Square = {
  row: number;
  col: number;
};
