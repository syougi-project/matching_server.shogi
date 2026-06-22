import type { ApplyMoveInput, ApplyMoveResult, RuleEngine } from '@/game/rule-engine';
import { normalizePortedSkillPieceCode } from '@/catalog/ported-skill-piece-code';
import { resolveGamePieceCode, resolveGamePieceCodeFromRules } from '@/catalog/game-piece-code';
import { applyNakuPonCaptures } from '@/game/naku-pon-capture';
import {
  applyCapturedVictimEffects,
  applyCookingCaptureSummon,
  applyDeathCurseExpirations,
  applyKatanaSideCaptures,
  applySealPassiveImmobilization,
  applySatoriHeartFromNotation,
  consumeRitualSubstitute,
  moveGearFollowLeader,
  shouldRitualSubstitute,
  tryHolySwordEvadeCapture,
  tryOboroEvadeCapture,
  tryShieldIntrinsicAbortHostileCapture,
} from '@/game/ported-app-capture-effects';
import { isArmor, isEn, isGun, isKatana, isRun, resolveDef } from '@/game/ported-app-piece-code';
import { generateRunForwardTargets } from '@/game/ported-app-run-move';
import { resolveBookMoveVectors, recordLastMovedPieceForBook } from '@/game/ported-app-book-moves';
import {
  applyGunPenetrationMidCapture,
  adjustVectorsForMoon,
  canCaptureTarget as canCaptureTargetSpecial,
  filterKatanaTargets,
  generateGunTargets,
  generateSatoriHeartNotationMoves,
} from '@/game/ported-app-stage19-moves';
import {
  adjustVectorsForHouseFieldPeople,
  isFixedHouseOrFieldPiece,
  peopleFieldBuffActive,
} from '@/game/ported-app-house-field-people';
import {
  GIANT_BOARD_MOVE_NOTATION,
  applyAuraVectorBuffs,
  decodePigInheritedSuffix,
  encodePigInheritedSuffix,
  findFrontFacingEnemy,
  findOccupantAt,
  generateConcaveEdgePierceTargets,
  generateGiantOrthogonalTargets,
  generateReflectiveTargets,
  isBook,
  isBondProtectedFromCapture,
  isCellAdjacentToAnySaint,
  isConcave,
  isConvex,
  isOtsu,
  isGiant,
  isHik,
  isMachine,
  isMirror,
  isPig,
  listAdjacentAllies,
  MIRROR_ORTHOGONAL_MOVE_VECTORS,
  pickMachineDonorAlly,
  resolveConcaveVectors,
  resolvePigInheritedPiece,
  giantAnchorFootprint,
} from '@/game/ported-app-remaining-pieces';
import {
  applyZaiSkillReplaceAllySenWithCaptured,
  applyYangAllySkillProcMultiplier,
  computeCowForwardPathDistance,
  computeYangSkillProcFactorForMover,
  cowForwardRowDelta,
  decodeStage45PieceCodePart,
  encodeStage45PieceSuffixes,
  generateCowForwardChargedTargets,
  isActorSkillProcSuppressedByAdjacentEnemyYin,
  isCow,
  isSen,
  isZai,
  maybeApplySenMoveSkillTransform,
  resolveSenZaiFallbackVectors,
} from '@/game/ported-app-stage45-pieces';
import {
  baseGameCodeForStandardPromotion,
} from '@/game/ported-app-move-vectors';
import {
  intrinsicCanJumpOverride,
  intrinsicMoveVectorOverride,
} from '@/game/shop-piece-move-vectors';
import { grantRandomAllySpringImmunity } from '@/game/spring-random-ally-immunity';
import {
  effectiveMovedSkillCode,
  resolveEffectivePieceDefinition,
} from '@/game/spring-ryu-awakening';
import type {
  GameSnapshot,
  MovePayload,
  MoveVector,
  PieceDefinition,
  PlayerSide,
  RuleSnapshot,
  SkillDefinition,
} from '@/types/domain';

type InternalPiece = {
  side: PlayerSide;
  code: string;
  promoted: boolean;
  mutantRevertCode?: string;
  pigInheritedCode?: string;
  pigInheritedPromoted?: boolean;
  cowChargeCount?: number;
};

type InternalBoard = Map<string, InternalPiece>;

type InternalHands = Record<PlayerSide, Record<string, number>>;

type SkillState = {
  board_hazards: Record<string, unknown>[];
  board_arrow_tiles: Record<string, unknown>[];
  movement_modifiers: Record<string, unknown>[];
  piece_statuses: Record<string, unknown>[];
  piece_defenses: Record<string, unknown>[];
  last_player_moved_piece?: Record<string, unknown>;
  last_enemy_moved_piece?: Record<string, unknown>;
};

type InternalGameState = {
  board: InternalBoard;
  hands: InternalHands;
  skillState: SkillState;
  turn: PlayerSide;
  moveCount: number;
};

type NormalizedMove = {
  from: string | null;
  to: string;
  piece: string;
  promote: boolean;
  drop: boolean;
  notation: string | null;
};

type AppliedStateResult =
  | {
      ok: true;
      board: InternalBoard;
      hands: InternalHands;
      skillState: SkillState;
      skillTriggered: boolean;
      grantsConvexFollowup?: boolean;
      grantsOtsuFollowup?: boolean;
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
  skillState: SkillState;
  actorSide: PlayerSide;
  movedPiece: InternalPiece;
  move: NormalizedMove;
  fromSquare: string | null;
  capturedPiece: InternalPiece | null;
};

const BOARD_SIZE = 9;
const RANKS = 'abcdefghi';
const GOLD_PROMOTED_CODES = new Set(['FU', 'KY', 'KE', 'GI']);
const PROMOTABLE_DEFAULT = new Set(['FU', 'KY', 'KE', 'GI', 'KA', 'HI']);
const STANDARD_CODES = new Set(['FU', 'KY', 'KE', 'GI', 'KI', 'KA', 'HI', 'OU']);
const TREASURE_REWARD_CODES = ['KI', 'GI', 'COPPER'] as const;
const HEN_EDGES = ['top', 'bottom', 'left', 'right'] as const;
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
      skillState: createEmptySkillState(),
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

    const state = parseGameState(input.game, input.rules);
    const move = normalizeMove(input.move);
    const applied = applyLegalMove(state, input.rules, input.actorSide, move);
    if (!applied.ok) {
      return applied;
    }

    const turnAdvanced = !applied.grantsConvexFollowup && !applied.grantsOtsuFollowup;
    const nextTurn = turnAdvanced ? opposite(input.actorSide) : input.actorSide;
    const nextState: InternalGameState = {
      board: applied.board,
      hands: applied.hands,
      skillState: applied.skillState,
      turn: nextTurn,
      moveCount: turnAdvanced ? input.game.moveCount + 1 : input.game.moveCount,
    };
    const nextGame: GameSnapshot = {
      boardState: serializeBoard(nextState.board),
      handsState: cloneHands(nextState.hands),
      skillState: cloneSkillState(nextState.skillState),
      turn: nextTurn,
      moveCount: nextState.moveCount,
      version: input.game.version + 1,
      lastMove: toMovePayload(move),
      lastSkillTriggered: applied.skillTriggered,
    };

    const opponentHasKing = findKingSquare(nextState.board, nextTurn) !== null;
    if (!opponentHasKing) {
      return {
        ok: true,
        nextGame,
        finished: { winnerSide: input.actorSide, reason: 'king_capture' },
      };
    }

    return { ok: true, nextGame };
  }
}

export function pickLegalMoveForBot(
  game: GameSnapshot,
  rules: RuleSnapshot,
  actorSide: PlayerSide,
): MovePayload | null {
  const state = parseGameState(game, rules);
  const moves = generateLegalMoves(state, rules, actorSide);
  if (moves.length === 0) return null;
  const index = Math.floor(Math.random() * moves.length);
  return toMovePayload(moves[index]!);
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

function parseGameState(game: GameSnapshot, rules: RuleSnapshot): InternalGameState {
  const board: InternalBoard = new Map();
  for (const [square, raw] of Object.entries(game.boardState)) {
    const piece = decodePiece(raw);
    if (piece) board.set(square.trim().toLowerCase(), normalizeBoardPiece(piece, rules));
  }
  return {
    board,
    hands: normalizeHands(cloneHands(game.handsState), rules),
    skillState: parseSkillState(game.skillState),
    turn: game.turn,
    moveCount: game.moveCount,
  };
}

function normalizeBoardPiece(piece: InternalPiece, rules: RuleSnapshot): InternalPiece {
  const definition = resolvePieceDefinition(rules, piece);
  if (!definition) return piece;
  const gameCode = resolveGamePieceCode(definition);
  if (gameCode === piece.code) return piece;
  return { ...piece, code: gameCode };
}

function normalizeHands(hands: InternalHands, rules: RuleSnapshot): InternalHands {
  const next: InternalHands = { black: {}, white: {} };
  for (const side of ['black', 'white'] as const) {
    for (const [rawCode, count] of Object.entries(hands[side])) {
      if (!count) continue;
      const gameCode = resolveGamePieceCodeFromRules(rules, rawCode) ?? rawCode.trim().toUpperCase();
      next[side][gameCode] = (next[side][gameCode] ?? 0) + count;
    }
  }
  return next;
}

function normalizeMove(move: MovePayload): NormalizedMove {
  const from = move.from?.trim().toLowerCase() ?? null;
  return {
    from,
    to: move.to.trim().toLowerCase(),
    piece: move.piece.trim().toUpperCase().replace(/\+$/, ''),
    promote: move.promote === true,
    drop: move.drop === true,
    notation: move.notation?.trim() || null,
  };
}

function applyLegalMove(
  state: InternalGameState,
  rules: RuleSnapshot,
  actorSide: PlayerSide,
  move: NormalizedMove,
): AppliedStateResult {
  const legalMoves = generateLegalMoves(state, rules, actorSide);
  const matched = legalMoves.find((candidate) => sameMove(candidate, move, rules));
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
    hands: normalizeHands(next.hands, rules),
    skillState: next.skillState,
    skillTriggered: next.skillTriggered,
    grantsConvexFollowup: next.grantsConvexFollowup,
    grantsOtsuFollowup: next.grantsOtsuFollowup,
  };
}

function activeFollowupCellForSide(
  skillState: SkillState,
  side: PlayerSide,
  statusType: string,
): Square | null {
  for (const entry of skillState.piece_statuses) {
    if (asString(entry.status_type ?? entry.statusType) !== statusType) continue;
    if (asSide(entry.side) !== side) continue;
    const remaining = asNumber(entry.remaining_turns ?? entry.remainingTurns) ?? 0;
    if (remaining <= 0) continue;
    const row = asNumber(entry.row);
    const col = asNumber(entry.col);
    if (row === null || col === null) continue;
    return { row, col };
  }
  return null;
}

function generateLegalMoves(
  state: InternalGameState,
  rules: RuleSnapshot,
  side: PlayerSide,
): NormalizedMove[] {
  const moves: NormalizedMove[] = [];
  const convexFollowup = activeFollowupCellForSide(state.skillState, side, 'convex_followup');
  const otsuFollowup = activeFollowupCellForSide(state.skillState, side, 'otsu_followup');
  const lockedFollowup = convexFollowup ?? otsuFollowup;
  const noCaptureOnly = otsuFollowup != null;

  for (const [square, piece] of state.board.entries()) {
    if (piece.side !== side) continue;
    if (lockedFollowup) {
      const source = parseSquare(square);
      if (source.row !== lockedFollowup.row || source.col !== lockedFollowup.col) continue;
    }
    if (isPieceImmobilized(state.skillState, state.board, rules, piece, square)) continue;
    const pseudoMoves = generatePseudoMovesForPiece(
      state.board,
      state.skillState,
      rules,
      square,
      piece,
      state.moveCount,
      { noCaptureOnly },
    );
    moves.push(...pseudoMoves);
  }

  if (lockedFollowup != null) {
    return moves;
  }

  for (const drop of generateDropMoves(state, rules, side)) {
    const next = applyMoveUnchecked(state, rules, side, drop, false);
    if (
      drop.piece === 'FU' &&
      isIllegalPawnDropMate(
        {
          board: next.board,
          hands: next.hands,
          skillState: next.skillState,
          turn: next.turn,
          moveCount: state.moveCount,
        },
        rules,
        opposite(side),
      )
    ) {
      continue;
    }
    moves.push(drop);
  }

  moves.push(...generateTimeSkillOnlyMoves(state, rules, side));
  moves.push(...generateHouseSkillOnlyMoves(state, rules, side));
  moves.push(...generateSatoriHeartNotationMoves({
    board: state.board,
    rules,
    side,
    baseMoves: moves,
    formatSquare,
    parseSquare,
  }));

  return moves;
}

function generatePseudoMovesForPiece(
  board: InternalBoard,
  skillState: SkillState,
  rules: RuleSnapshot,
  from: string,
  piece: InternalPiece,
  moveCount: number,
  options?: { noCaptureOnly?: boolean },
): NormalizedMove[] {
  const definition = resolveEffectivePieceDefinition(rules, board.values(), piece);
  if (!definition) return [];
  const source = parseSquare(from);
  const pieceDef = resolvePieceDefinition(rules, piece);
  if (isFixedHouseOrFieldPiece(piece, pieceDef)) {
    return [];
  }

  if (isGiant(piece, pieceDef)) {
    const targets = generateGiantOrthogonalTargets({
      board,
      rules,
      actorSide: piece.side,
      from: source,
      formatSquare,
      canCaptureAt: (row, col, occupant) => {
        const sq = formatSquare(row, col);
        if (isBondProtectedFromCapture(board, rules, sq, occupant, formatSquare)) return false;
        return canCaptureTargetSpecial({
          board,
          rules,
          actorSide: piece.side,
          mover: piece,
          moverDef: pieceDef,
          target: occupant,
          targetDef: resolveDef(rules, occupant),
        });
      },
    });
    const giantMoves = targets.map((target) => ({
      from,
      to: formatSquare(target.row, target.col),
      piece: piece.code,
      promote: false,
      drop: false,
      notation: GIANT_BOARD_MOVE_NOTATION,
    }));
    return filterFollowupMoves(board, piece.side, giantMoves, options?.noCaptureOnly === true);
  }

  let targets = getMovementTargets(
    board,
    skillState,
    rules,
    piece.side,
    source,
    definition,
    piece.promoted,
    piece.code,
    moveCount,
    from,
  );
  targets = filterKatanaTargets({
    board,
    rules,
    actorSide: piece.side,
    from: source,
    targets,
    piece,
    def: pieceDef,
  });
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
        notation: null,
      });
    }
  }

  return filterFollowupMoves(board, piece.side, moves, options?.noCaptureOnly === true);
}

function filterFollowupMoves(
  board: InternalBoard,
  side: PlayerSide,
  moves: NormalizedMove[],
  noCaptureOnly: boolean,
): NormalizedMove[] {
  if (!noCaptureOnly) return moves;
  return moves.filter((move) => {
    const occupant = board.get(move.to);
    return !occupant || occupant.side === side;
  });
}

function generateDropMoves(
  state: InternalGameState,
  rules: RuleSnapshot,
  side: PlayerSide,
): NormalizedMove[] {
  const bag = state.hands[side];
  const moves: NormalizedMove[] = [];

  for (const [pieceCodeRaw, count] of Object.entries(bag)) {
    if (count <= 0) continue;
    const pieceCode =
      resolveGamePieceCodeFromRules(rules, pieceCodeRaw) ?? pieceCodeRaw.trim().toUpperCase();
    if (pieceCode === 'OU') continue;
    if (!resolvePieceDefinition(rules, { side, code: pieceCode, promoted: false })) continue;
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const square = formatSquare(row, col);
        if (state.board.has(square)) continue;
        if (isDropBlockedBySkillState(state.skillState, side, row, col)) continue;
        if (!canDropPiece(state.board, state.hands, side, pieceCode, row, col)) continue;
        moves.push({
          from: null,
          to: square,
          piece: pieceCode,
          promote: false,
          drop: true,
          notation: null,
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
  skillState: SkillState,
  rules: RuleSnapshot,
  side: PlayerSide,
  source: Square,
  definition: PieceDefinition,
  promoted: boolean,
  pieceCode: string,
  moveCount: number,
  fromSquare: string,
) {
  const sourcePiece = board.get(fromSquare) ?? { side, code: pieceCode, promoted };
  const internalPiece: InternalPiece = {
    ...sourcePiece,
    side,
    code: pieceCode,
    promoted: promoted || sourcePiece.promoted,
  };
  const pieceDef = resolveDef(rules, internalPiece);
  const pigOverlay = resolvePigInheritedPiece(internalPiece);
  const mover = pigOverlay ?? internalPiece;
  const moverDef = pigOverlay ? resolveDef(rules, pigOverlay) : pieceDef;
  const moverDefinition =
    pigOverlay && moverDef
      ? moverDef
      : definition;

  if (isGun(mover, moverDef)) {
    return filterByMovementModifier(
      generateGunTargets({
        board,
        rules,
        actorSide: side,
        from: source,
        piece: mover,
        def: moverDef,
        formatSquare,
        canCaptureTarget: (target, targetDef) =>
          canCaptureTargetAt(board, rules, side, mover, moverDef, target, targetDef, formatSquare),
      }),
      skillState,
      side,
      source,
      definition.pieceCode,
      board,
      rules,
    );
  }

  if (isRun(mover, moverDef)) {
    return filterByMovementModifier(
      generateRunForwardTargets({
        board,
        rules,
        actorSide: side,
        from: source,
        piece: mover,
        def: moverDef,
        formatSquare,
      }),
      skillState,
      side,
      source,
      definition.pieceCode,
      board,
      rules,
    );
  }

  const targets: Square[] = [];
  let vectors = isBook(mover, moverDef)
    ? resolveBookMoveVectors(rules, skillState, side)
    : isConcave(mover, moverDef)
    ? resolveConcaveVectors()
    : resolveSenZaiFallbackVectors(
        mover,
        moverDef,
        getMoveVectorsForPiece(moverDefinition, pigOverlay ? mover.promoted : promoted),
      );
  vectors = adjustVectorsForMoon(vectors, mover, moverDef, moveCount + 1);

  if (isMachine(mover, moverDef)) {
    const donor = pickMachineDonorAlly(board, rules, fromSquare, mover, formatSquare);
    if (donor) {
      const donorDef = resolveDef(rules, donor.piece);
      if (donorDef && donorDef.moveVectors.length > 0) {
        vectors = donorDef.moveVectors.map((v) => ({ ...v }));
      }
    }
  }

  if (isMirror(mover, moverDef)) {
    const frontEnemy = findFrontFacingEnemy(
      board,
      rules,
      side,
      source,
      formatSquare,
      orientRowDelta,
    );
    if (frontEnemy) {
      const selectedDef = resolveDef(rules, frontEnemy.piece);
      if (selectedDef && selectedDef.moveVectors.length > 0) {
        vectors = selectedDef.moveVectors.map((v) => ({ ...v }));
      }
    } else {
      vectors = MIRROR_ORTHOGONAL_MOVE_VECTORS.map((v) => ({ ...v }));
    }
  }

  vectors = applyAuraVectorBuffs({
    board,
    rules,
    square: fromSquare,
    piece: internalPiece,
    vectors,
    formatSquare,
  });
  vectors = adjustVectorsForHouseFieldPeople({
    vectors,
    board,
    rules,
    piece: mover,
    def: moverDef,
    actorSide: side,
  });

  const cloudMode = isCloudMover(moverDefinition);
  const canJump =
    moverDefinition.canJump === true || intrinsicCanJumpOverride(moverDefinition);

  for (const vector of vectors) {
    if (isCow(mover, moverDef) && vector.dx === 0 && vector.dy === -1) continue;
    if (isLeapOverOneMode(vector.captureMode)) {
      targets.push(...generateLeapOverOneTargets(board, skillState, side, source, vector));
      continue;
    }
    targets.push(
      ...generateSlidingTargetsForPattern(
        board,
        skillState,
        rules,
        side,
        source,
        vectorToPattern(vector, canJump),
        cloudMode,
      ),
    );
  }

  if (isCow(mover, moverDef)) {
    targets.push(
      ...generateCowForwardChargedTargets({
        board,
        rules,
        skillState,
        piece: { ...internalPiece, code: mover.code },
        from: source,
        formatSquare,
        isCellBlockedByHazard: (row, col) => isCellBlockedByHazard(skillState, row, col),
      }),
    );
  }

  if (isConcave(mover, moverDef)) {
    const pierce = generateConcaveEdgePierceTargets({
      board,
      rules,
      side,
      source,
      formatSquare,
      orientRowDelta,
    });
    targets.push(...pierce);
  }

  if (isHik(mover, moverDef)) {
    targets.push(
      ...generateReflectiveTargets({
        board,
        rules,
        source,
        side,
        formatSquare,
      }),
    );
  }

  if (isEn(mover, moverDef)) {
    const kingFront = enAllyKingFrontTarget(board, side, source);
    if (kingFront) {
      const occupantEntry = findOccupantAt(board, rules, kingFront.row, kingFront.col, formatSquare);
      const occupant = occupantEntry?.piece ?? null;
      if (!occupant || occupant.side !== side) {
        targets.push(kingFront);
      }
    }
  }

  return filterByMovementModifier(
    dedupeSquares(targets).filter((target) => {
      if (isKingBlockedByPoisonCell(skillState, side, pieceCode, target.row, target.col)) return false;
      const occupantEntry = findOccupantAt(board, rules, target.row, target.col, formatSquare);
      const occupant = occupantEntry?.piece ?? null;
      if (!occupant || occupant.side === side) return true;
      const targetSquare = formatSquare(target.row, target.col);
      if (isBondProtectedFromCapture(board, rules, targetSquare, occupant, formatSquare)) return false;
      return canCaptureTargetAt(board, rules, side, mover, moverDef, occupant, resolveDef(rules, occupant), formatSquare);
    }),
    skillState,
    side,
    source,
    definition.pieceCode,
    board,
    rules,
  );
}

function canCaptureTargetAt(
  board: InternalBoard,
  rules: RuleSnapshot,
  actorSide: PlayerSide,
  mover: InternalPiece,
  moverDef: PieceDefinition | null,
  target: InternalPiece,
  targetDef: PieceDefinition | null,
  formatSquare: (row: number, col: number) => string,
): boolean {
  const targetSquare = [...board.entries()].find(([, p]) => p === target)?.[0];
  if (targetSquare && isBondProtectedFromCapture(board, rules, targetSquare, target, formatSquare)) {
    return false;
  }
  return canCaptureTargetSpecial({
    board,
    rules,
    actorSide,
    mover,
    moverDef,
    target,
    targetDef,
  });
}

function isLeapOverOneMode(mode: string | null | undefined): boolean {
  if (!mode) return false;
  const normalized = mode.trim().toLowerCase();
  return (
    normalized === 'leapoverone' || normalized === 'leap_over_one' || normalized === 'leap-over-one'
  );
}

function vectorToPattern(vector: MoveVector, canJump: boolean): MovementPattern {
  return {
    rowDelta: vector.dy,
    colDelta: vector.dx,
    maxStep: Math.max(1, vector.maxStep),
    canJump,
  };
}

function generateSlidingTargetsForPattern(
  board: InternalBoard,
  skillState: SkillState,
  rules: RuleSnapshot,
  side: PlayerSide,
  source: Square,
  pattern: MovementPattern,
  cloudMode = false,
): Square[] {
  const targets: Square[] = [];
  for (let step = 1; step <= pattern.maxStep; step += 1) {
    const row = source.row + orientRowDelta(side, pattern.rowDelta * step);
    const col = source.col + pattern.colDelta * step;
    if (!isInsideBoard(row, col)) break;
    const square = formatSquare(row, col);
    if (isCellBlockedByHazard(skillState, row, col)) break;
    const occupantEntry = findOccupantAt(board, rules, row, col, formatSquare);
    const occupant = occupantEntry?.piece;
    if (cloudMode) {
      if (occupant?.side !== side) {
        if (occupant) break;
        targets.push({ row, col });
        if (pattern.canJump && pattern.maxStep > 1) continue;
        if (!pattern.canJump && pattern.maxStep === 1) break;
        continue;
      }
      if (occupant) {
        if (occupant.code === 'OU') break;
        if (isCaptureBlocked(skillState, occupant, square)) break;
        targets.push({ row, col });
        break;
      }
      targets.push({ row, col });
      if (pattern.canJump && pattern.maxStep > 1) continue;
      if (!pattern.canJump && pattern.maxStep === 1) break;
      continue;
    }
    if (occupant?.side === side) break;
    if (occupant && isCaptureBlocked(skillState, occupant, square)) break;
    targets.push({ row, col });
    if (occupant || (!pattern.canJump && pattern.maxStep === 1)) break;
    if (occupant || pattern.canJump) {
      if (!occupant) continue;
      break;
    }
  }
  return targets;
}

function isCloudMover(definition: PieceDefinition): boolean {
  const code = resolveGamePieceCode(definition);
  return code === 'CLOUD' || definition.char === '雲';
}

/** 砲(HOU): 直線上の空マスへ移動、または1枚挟んで敵を取る */
function generateLeapOverOneTargets(
  board: InternalBoard,
  skillState: SkillState,
  side: PlayerSide,
  source: Square,
  vector: MoveVector,
): Square[] {
  const targets: Square[] = [];
  const seen = new Set<string>();
  const rowDelta = orientRowDelta(side, vector.dy);
  const colDelta = vector.dx;
  let row = source.row + rowDelta;
  let col = source.col + colDelta;
  let platformFound = false;

  while (isInsideBoard(row, col)) {
    if (isCellBlockedByHazard(skillState, row, col)) break;
    const square = formatSquare(row, col);
    const occupant = board.get(square);
    if (occupant) {
      platformFound = true;
      row += rowDelta;
      col += colDelta;
      break;
    }
    const key = `${row}:${col}`;
    if (!seen.has(key)) {
      seen.add(key);
      targets.push({ row, col });
    }
    row += rowDelta;
    col += colDelta;
  }

  if (!platformFound) return targets;

  while (isInsideBoard(row, col)) {
    if (isCellBlockedByHazard(skillState, row, col)) break;
    const square = formatSquare(row, col);
    const occupant = board.get(square);
    if (!occupant) {
      row += rowDelta;
      col += colDelta;
      continue;
    }
    if (occupant.side !== side && !isCaptureBlocked(skillState, occupant, square)) {
      const key = `${row}:${col}`;
      if (!seen.has(key)) {
        seen.add(key);
        targets.push({ row, col });
      }
    }
    break;
  }

  return targets;
}

function getMoveVectorsForPiece(definition: PieceDefinition, promoted: boolean): MoveVector[] {
  const baseCode = baseGameCodeForStandardPromotion(definition);

  if (promoted && GOLD_PROMOTED_CODES.has(baseCode)) {
    return goldPatterns().map((pattern) => ({
      dx: pattern.colDelta,
      dy: pattern.rowDelta,
      maxStep: pattern.maxStep,
    }));
  }

  const intrinsicOverride = intrinsicMoveVectorOverride(definition);
  const baseVectors = intrinsicOverride ?? definition.moveVectors;

  if (promoted && baseCode === 'KA') {
    return [
      ...baseVectors,
      ...kingOrthogonalPatterns().map((pattern) => ({
        dx: pattern.colDelta,
        dy: pattern.rowDelta,
        maxStep: pattern.maxStep,
      })),
    ];
  }
  if (promoted && baseCode === 'HI') {
    return [
      ...baseVectors,
      ...kingDiagonalPatterns().map((pattern) => ({
        dx: pattern.colDelta,
        dy: pattern.rowDelta,
        maxStep: pattern.maxStep,
      })),
    ];
  }

  if (intrinsicOverride) return intrinsicOverride;
  return definition.moveVectors;
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
  const skillState = cloneSkillState(state.skillState);
  const boardBeforeMove = cloneBoard(state.board);
  const otsuFollowupBefore = activeFollowupCellForSide(skillState, actorSide, 'otsu_followup');
  const convexFollowupBefore = activeFollowupCellForSide(skillState, actorSide, 'convex_followup');
  let movedPiece: InternalPiece;
  let capturedPiece: InternalPiece | null = null;
  let phantomEvadedThisMove = false;
  let holySwordEvadedThisMove = false;
  let shieldAbortedMove = false;
  let ritualAbortedMove = false;
  let combatAbortedMove = false;
  let stage45SkillTriggered = false;
  const fromSquare = move.drop ? null : move.from;

  if (move.drop) {
    decrementHand(hands, actorSide, move.piece);
    movedPiece = { side: actorSide, code: move.piece, promoted: false };
    board.set(move.to, movedPiece);
  } else {
    const current = board.get(move.from ?? '');
    if (!current) {
      throw new Error('moving piece not found');
    }

    if (move.notation === GIANT_BOARD_MOVE_NOTATION) {
      board.delete(move.from ?? '');
      const toPos = parseSquare(move.to);
      const destCells = giantAnchorFootprint(toPos.row, toPos.col);
      const victims: Array<{ square: string; piece: InternalPiece }> = [];
      for (const cell of destCells) {
        const occ = findOccupantAt(board, rules, cell.row, cell.col, formatSquare);
        if (!occ || occ.piece.side === actorSide) continue;
        if (victims.some((v) => v.square === occ.square)) continue;
        victims.push({ square: occ.square, piece: occ.piece });
      }
      for (const victim of victims) {
        board.delete(victim.square);
        if (victim.piece.code === 'OU') continue;
        incrementHand(hands, actorSide, capturedPieceToHandCode(rules, victim.piece));
        applyCapturedVictimEffects({
          board,
          rules,
          skillState,
          actorSide,
          capturedPiece: victim.piece,
          captureSquare: victim.square,
          moverSquare: move.to,
          parseSquare,
          formatSquare,
          isInsideBoard,
        });
        capturedPiece = victim.piece;
      }
      movedPiece = {
        side: actorSide,
        code: current.code,
        promoted: move.promote || current.promoted,
        pigInheritedCode: current.pigInheritedCode,
        pigInheritedPromoted: current.pigInheritedPromoted,
      };
      board.set(move.to, movedPiece);
      moveAttachedSkillState(skillState, actorSide, move.from ?? '', move.to);
    } else {
      movedPiece = {
        side: actorSide,
        code: current.code,
        promoted: move.promote || current.promoted,
        pigInheritedCode: current.pigInheritedCode,
        pigInheritedPromoted: current.pigInheritedPromoted,
        cowChargeCount: current.cowChargeCount,
      };
      capturedPiece = board.get(move.to) ?? null;
      const capturePos = parseSquare(move.to);
      const fromPos = move.from ? parseSquare(move.from) : null;
      const currentDef = resolveDef(rules, current);
      let zaiCapturedEnemySnapshot: InternalPiece | null = null;
      if (!capturedPiece) {
        const occ = findOccupantAt(board, rules, capturePos.row, capturePos.col, formatSquare);
        if (occ && occ.piece.side !== actorSide) capturedPiece = occ.piece;
      }
      if (
        capturedPiece &&
        capturedPiece.side !== actorSide &&
        isGiant(capturedPiece, resolveDef(rules, capturedPiece))
      ) {
        throw new Error('cannot capture giant');
      }
      if (
        fromPos &&
        isCow(current, currentDef)
      ) {
        const pathDist = computeCowForwardPathDistance(
          actorSide,
          fromPos.row,
          fromPos.col,
          capturePos.row,
          capturePos.col,
        );
        if (pathDist != null && pathDist > 1) {
          const d = cowForwardRowDelta(actorSide);
          for (let s = 1; s < pathDist; s += 1) {
            const row = fromPos.row + d * s;
            const col = fromPos.col;
            const midSquare = formatSquare(row, col);
            let mid = board.get(midSquare);
            if (!mid) {
              const occ = findOccupantAt(board, rules, row, col, formatSquare);
              mid = occ?.piece;
            }
            if (!mid || mid.side === actorSide) continue;
            const midEntry = findOccupantAt(board, rules, row, col, formatSquare);
            if (midEntry) board.delete(midEntry.square);
            else board.delete(midSquare);
            incrementHand(hands, actorSide, capturedPieceToHandCode(rules, mid));
            capturedPiece = mid;
          }
        }
      }
      if (
        capturedPiece &&
        capturedPiece.side !== actorSide &&
        isZai(current, currentDef)
      ) {
        zaiCapturedEnemySnapshot = { ...capturedPiece };
      }
      if (
        capturedPiece &&
        capturedPiece.side !== actorSide &&
        capturedPiece.code !== 'OU' &&
        shouldRitualSubstitute({
          board,
          rules,
          capturedPiece,
          captureSquare: move.to,
        })
      ) {
        ritualAbortedMove = true;
        consumeRitualSubstitute({
          board,
          rules,
          defenderSide: capturedPiece.side,
          excludeSquare: move.to,
        });
        capturedPiece = null;
      } else if (
        capturedPiece &&
        capturedPiece.side !== actorSide &&
        capturedPiece.code !== 'OU' &&
        tryShieldIntrinsicAbortHostileCapture({
          actorSide,
          victim: capturedPiece,
          victimRow: capturePos.row,
          victimCol: capturePos.col,
          board,
          rules,
          parseSquare,
        })
      ) {
        shieldAbortedMove = true;
        capturedPiece = null;
      }
      combatAbortedMove = shieldAbortedMove || ritualAbortedMove;
      if (!combatAbortedMove) {
        board.delete(move.from ?? '');
        if (
          fromSquare &&
          isGun(movedPiece, resolveDef(rules, movedPiece)) &&
          applyGunPenetrationMidCapture({
            board,
            rules,
            hands,
            actorSide,
            movedPiece,
            fromSquare,
            toSquare: move.to,
            formatSquare,
            parseSquare,
            capturedToHandCode: (piece) => capturedPieceToHandCode(rules, piece),
            incrementHand: (side, code) => incrementHand(hands, side, code),
          })
        ) {
          phantomEvadedThisMove = true;
        }
      }
      if (!combatAbortedMove && capturedPiece && capturedPiece.code !== 'OU') {
        const holySwordEvade = tryHolySwordEvadeCapture({
          board,
          rules,
          capturedPiece,
          captureSquare: move.to,
          formatSquare,
          parseSquare,
        });
        if (holySwordEvade) {
          board.set(holySwordEvade, capturedPiece);
          moveAttachedSkillState(skillState, capturedPiece.side, move.to, holySwordEvade);
          capturedPiece = null;
          holySwordEvadedThisMove = true;
        } else {
          const oboroEvade = tryOboroEvadeCapture({
            board,
            rules,
            capturedPiece,
            captureSquare: move.to,
            formatSquare,
            parseSquare,
            isInsideBoard,
          });
          if (oboroEvade) {
            board.set(oboroEvade, capturedPiece);
            moveAttachedSkillState(skillState, capturedPiece.side, move.to, oboroEvade);
            capturedPiece = null;
          } else {
            const evadeSquare = tryPhantomEvadeCapture(board, rules, skillState, capturedPiece, capturePos);
          if (evadeSquare) {
            board.set(evadeSquare, capturedPiece);
            moveAttachedSkillState(skillState, capturedPiece.side, move.to, evadeSquare);
            capturedPiece = null;
            phantomEvadedThisMove = true;
          } else if (
            hasChrysanthemumRevival(
              skillState,
              capturedPiece.side,
              capturePos.row,
              capturePos.col,
            )
          ) {
            removeChrysanthemumRevivalAtCell(
              skillState,
              capturedPiece.side,
              capturePos.row,
              capturePos.col,
            );
            incrementHand(hands, capturedPiece.side, capturedPieceToHandCode(rules, capturedPiece));
          } else {
            incrementHand(
              hands,
              actorSide,
              capturedPieceToHandCode(rules, capturedPiece),
            );
            applyCapturedVictimEffects({
              board,
              rules,
              skillState,
              actorSide,
              capturedPiece,
              captureSquare: move.to,
              moverSquare: move.to,
              parseSquare,
              formatSquare,
              isInsideBoard,
            });
          }
        }
        }
        const occEntry = findOccupantAt(
          board,
          rules,
          capturePos.row,
          capturePos.col,
          formatSquare,
        );
        if (occEntry) board.delete(occEntry.square);
      }
      if (
        !combatAbortedMove &&
        capturedPiece &&
        capturedPiece.side !== actorSide &&
        isPig(movedPiece, resolveDef(rules, movedPiece))
      ) {
        movedPiece = {
          ...movedPiece,
          pigInheritedCode: capturedPieceToHandCode(rules, capturedPiece),
          pigInheritedPromoted: capturedPiece.promoted,
        };
      }
      if (!combatAbortedMove) {
        const cowDef = resolveDef(rules, movedPiece);
        if (fromPos && isCow(movedPiece, cowDef)) {
          const pathDist = computeCowForwardPathDistance(
            actorSide,
            fromPos.row,
            fromPos.col,
            capturePos.row,
            capturePos.col,
          );
          const isCowForwardMove = pathDist != null;
          const isCowBackMove =
            fromPos.col === capturePos.col &&
            capturePos.row - fromPos.row === -cowForwardRowDelta(actorSide);
          movedPiece = {
            ...movedPiece,
            cowChargeCount: isCowForwardMove
              ? 0
              : isCowBackMove
                ? Math.min(8, Math.max(0, Math.floor(current.cowChargeCount ?? 0)) + 1)
                : Math.max(0, Math.floor(current.cowChargeCount ?? 0)),
          };
        }
        if (isSen(movedPiece, cowDef)) {
          movedPiece = maybeApplySenMoveSkillTransform(movedPiece, rules);
        }
        board.set(move.to, movedPiece);
        moveAttachedSkillState(skillState, actorSide, move.from ?? '', move.to);
        if (
          zaiCapturedEnemySnapshot &&
          isZai(movedPiece, cowDef) &&
          capturedPiece &&
          applyZaiSkillReplaceAllySenWithCaptured({
            board,
            rules,
            actorSide,
            capturedEnemy: zaiCapturedEnemySnapshot,
            zaiLandingSquare: move.to,
          })
        ) {
          stage45SkillTriggered = true;
        }
      }
    }
  }

  combatAbortedMove = shieldAbortedMove || ritualAbortedMove;
  let skillTriggered =
    phantomEvadedThisMove || holySwordEvadedThisMove || combatAbortedMove || stage45SkillTriggered;
  if (
    !combatAbortedMove &&
    !move.drop &&
    capturedPiece &&
    capturedPiece.code !== 'OU' &&
    applyNakuPonCaptures({
      rules,
      boardBeforeMove,
      board,
      hands,
      actorSide,
      movedPiece,
      move,
      capturedPiece,
      capturedToHandCode: (piece) => capturedPieceToHandCode(rules, piece),
      incrementHand: (side, pieceCode) => incrementHand(hands, side, pieceCode),
    })
  ) {
    skillTriggered = true;
  }
  if (!combatAbortedMove && allowSkills) {
    const applied = applySkills(rules, {
      board,
      hands,
      skillState,
      actorSide,
      movedPiece,
      move,
      fromSquare,
      capturedPiece,
    });
    skillTriggered = applied || skillTriggered;
  }

  const didCapture = Boolean(capturedPiece);
  if (
    !combatAbortedMove &&
    !move.drop &&
    didCapture &&
    applyKatanaSideCaptures({
      board,
      rules,
      hands,
      actorSide,
      movedPiece,
      moveFrom: move.from ?? '',
      moveTo: move.to,
      didCapture: true,
      parseSquare,
      formatSquare,
      isInsideBoard,
      capturedToHandCode: (piece) => capturedPieceToHandCode(rules, piece),
      incrementHand: (side, code) => incrementHand(hands, side, code),
    })
  ) {
    skillTriggered = true;
  }
  if (
    !combatAbortedMove &&
    !move.drop &&
    didCapture &&
    applyCookingCaptureSummon({
      board,
      rules,
      skillState,
      actorSide,
      movedPiece,
      didCapture: true,
      formatSquare,
      isInsideBoard,
    })
  ) {
    skillTriggered = true;
  }
  if (
    !combatAbortedMove &&
    !move.drop &&
    applySatoriHeartFromNotation({
      board,
      rules,
      skillState,
      actorSide,
      movedPiece,
      notation: move.notation,
      parseSquare,
      formatSquare,
    })
  ) {
    skillTriggered = true;
  }
  if (
    !combatAbortedMove &&
    !move.drop &&
    fromSquare &&
    moveGearFollowLeader({
      board,
      skillState,
      actorSide,
      fromSquare,
      toSquare: move.to,
      rules,
      parseSquare,
      formatSquare,
      isInsideBoard,
      moveAttachedSkillState,
    })
  ) {
    skillTriggered = true;
  }

  if (!combatAbortedMove) {
    const landedPiece = board.get(move.to);
    if (landedPiece?.side === actorSide && applyPoisonHazardsOnLanding(skillState, board, actorSide, move.to)) {
      skillTriggered = true;
    }
  }
  applyPassiveSkillAuras(skillState, board, rules);
  applyMutantReverts(board);
  skillState.movement_modifiers = pruneDanceMovementModifiersNotAdjacentToMai(
    skillState.movement_modifiers,
    board,
  );
  tickSkillStateDurations(skillState);
  applyDeathCurseExpirations({ board, skillState });

  let grantsConvexFollowup = false;
  let grantsOtsuFollowup = false;
  if (
    allowSkills &&
    !combatAbortedMove &&
    !move.drop &&
    fromSquare &&
    !otsuFollowupBefore &&
    !convexFollowupBefore &&
    isConvex(movedPiece, resolveDef(rules, movedPiece))
  ) {
    const dest = parseSquare(move.to);
    skillState.piece_statuses.push({
      side: actorSide,
      row: dest.row,
      col: dest.col,
      status_type: 'convex_followup',
      remaining_turns: 1,
    });
    const previewState: InternalGameState = {
      board,
      hands,
      skillState,
      turn: actorSide,
      moveCount: state.moveCount,
    };
    grantsConvexFollowup = generateLegalMoves(previewState, rules, actorSide).length > 0;
    if (!grantsConvexFollowup) {
      skillState.piece_statuses = skillState.piece_statuses.filter(
        (entry) => asString(entry.status_type ?? entry.statusType) !== 'convex_followup',
      );
    }
  }

  if (
    allowSkills &&
    !combatAbortedMove &&
    !move.drop &&
    fromSquare &&
    !otsuFollowupBefore &&
    didCapture &&
    isOtsu(movedPiece, resolveDef(rules, movedPiece))
  ) {
    const dest = parseSquare(move.to);
    skillState.piece_statuses.push({
      side: actorSide,
      row: dest.row,
      col: dest.col,
      status_type: 'otsu_followup',
      remaining_turns: 1,
    });
    const previewState: InternalGameState = {
      board,
      hands,
      skillState,
      turn: actorSide,
      moveCount: state.moveCount,
    };
    grantsOtsuFollowup = generateLegalMoves(previewState, rules, actorSide).length > 0;
    if (!grantsOtsuFollowup) {
      skillState.piece_statuses = skillState.piece_statuses.filter(
        (entry) => asString(entry.status_type ?? entry.statusType) !== 'otsu_followup',
      );
    }
  }

  if (!combatAbortedMove && !move.drop && fromSquare) {
    recordLastMovedPieceForBook(
      skillState,
      actorSide,
      movedPiece,
      resolveDef(rules, movedPiece),
      parseSquare(move.to),
    );
  }

  return {
    board,
    hands,
    skillState,
    turn: opposite(actorSide),
    skillTriggered,
    grantsConvexFollowup,
    grantsOtsuFollowup,
  };
}

function applySkills(rules: RuleSnapshot, context: SkillContext) {
  const pieceDefs = collectMatchingSkillDefinitions(rules, context.movedPiece);
  let applied = false;

  for (const definition of pieceDefs) {
    if (!shouldTriggerSkillDefinition(definition)) continue;
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

  applied = applyScriptedPieceSkills(rules, context) || applied;

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

function removeRandomAdjacentEnemyPiece(context: SkillContext) {
  const candidates = adjacentEnemySquares(context, parseSquare(context.move.to), true);
  const square = pickRandom(candidates);
  if (!square) return false;
  context.board.delete(square);
  return true;
}

function removeUpToRandomAdjacentEnemyPieces(context: SkillContext, maxRemove: number) {
  const candidates = adjacentEnemySquares(context, parseSquare(context.move.to), true);
  let removed = 0;
  while (candidates.length > 0 && removed < maxRemove) {
    const idx = Math.floor(Math.random() * candidates.length);
    const square = candidates.splice(idx, 1)[0];
    if (!square) continue;
    context.board.delete(square);
    removed += 1;
  }
  return removed > 0;
}

function sendAllAdjacentEnemiesToOwnerHands(context: SkillContext) {
  const candidates = adjacentEnemySquares(context, parseSquare(context.move.to), false);
  for (const square of candidates) {
    const target = context.board.get(square);
    if (!target) continue;
    context.board.delete(square);
    incrementHand(context.hands, target.side, target.code);
  }
  return candidates.length > 0;
}

function sendRandomEnemyToOwnerHand(context: SkillContext) {
  const candidates = Array.from(context.board.entries()).filter(([, piece]) => {
    return piece.side !== context.actorSide && piece.code !== 'OU';
  });
  const selected = pickRandom(candidates);
  if (!selected) return false;
  const [square, piece] = selected;
  context.board.delete(square);
  incrementHand(context.hands, piece.side, piece.code);
  return true;
}

function applyAdjacentEnemyStatus(context: SkillContext, statusType: string, durationTurns: number) {
  const center = parseSquare(context.move.to);
  let applied = false;
  forEachAdjacent(center, (row, col) => {
    const square = formatSquare(row, col);
    const target = context.board.get(square);
    if (!target || target.side === context.actorSide || target.code === 'OU') return;
    context.skillState.piece_statuses.push({
      row,
      col,
      side: target.side,
      status_type: statusType,
      remaining_turns: durationTurns,
    });
    applied = true;
  });
  return applied;
}

function applyOrthogonalAdjacentEnemyStatus(
  context: SkillContext,
  statusType: string,
  durationTurns: number,
) {
  const center = parseSquare(context.move.to);
  let applied = false;
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    const row = center.row + dr;
    const col = center.col + dc;
    if (!isInsideBoard(row, col)) continue;
    const square = formatSquare(row, col);
    const target = context.board.get(square);
    if (!target || target.side === context.actorSide || target.code === 'OU') continue;
    context.skillState.piece_statuses.push({
      row,
      col,
      side: target.side,
      status_type: statusType,
      remaining_turns: durationTurns,
    });
    applied = true;
  }
  return applied;
}

function applyRandomAdjacentEnemyStatus(context: SkillContext, statusType: string, durationTurns: number) {
  const square = pickRandom(adjacentEnemySquares(context, parseSquare(context.move.to), true));
  if (!square) return false;
  const target = context.board.get(square);
  if (!target) return false;
  const { row, col } = parseSquare(square);
  context.skillState.piece_statuses.push({
    row,
    col,
    side: target.side,
    status_type: statusType,
    remaining_turns: durationTurns,
  });
  return true;
}

function applyRandomEnemyStatus(context: SkillContext, statusType: string, durationTurns: number) {
  const candidates = Array.from(context.board.entries()).filter(([, piece]) => {
    return piece.side !== context.actorSide && piece.code !== 'OU';
  });
  const selected = pickRandom(candidates);
  if (!selected) return false;
  const [square, target] = selected;
  const { row, col } = parseSquare(square);
  context.skillState.piece_statuses.push({
    row,
    col,
    side: target.side,
    status_type: statusType,
    remaining_turns: durationTurns,
  });
  return true;
}

function transformAdjacentEnemies(context: SkillContext, toCode: string) {
  const candidates = adjacentEnemySquares(context, parseSquare(context.move.to), true);
  let transformed = false;
  for (const square of candidates) {
    const target = context.board.get(square);
    if (!target) continue;
    context.board.set(square, { side: target.side, code: toCode, promoted: false });
    transformed = true;
  }
  return transformed;
}

function transformAdjacentEnemiesToMutant(context: SkillContext) {
  const candidates = adjacentEnemySquares(context, parseSquare(context.move.to), true);
  let transformed = false;
  for (const square of candidates) {
    const target = context.board.get(square);
    if (!target || target.code === 'MUTANT') continue;
    context.board.set(square, {
      side: target.side,
      code: 'MUTANT',
      promoted: false,
      mutantRevertCode: target.code,
    });
    transformed = true;
  }
  return transformed;
}

function transformRandomEnemySpecialToPawn(context: SkillContext) {
  const candidates = Array.from(context.board.entries()).filter(([, piece]) => {
    return piece.side !== context.actorSide && piece.code !== 'OU' && !STANDARD_CODES.has(canonicalPieceCode(piece.code));
  });
  const selected = pickRandom(candidates);
  if (!selected) return false;
  const [square, target] = selected;
  context.board.set(square, { side: target.side, code: 'FU', promoted: false });
  const { row, col } = parseSquare(square);
  context.skillState.piece_statuses.push({
    row,
    col,
    side: target.side,
    status_type: 'an_transform',
    remaining_turns: 999,
  });
  return true;
}

function transformRandomAllyPawn(context: SkillContext, toCode: string) {
  const candidates = Array.from(context.board.entries()).filter(([, piece]) => {
    return piece.side === context.actorSide && piece.code === 'FU' && !piece.promoted;
  });
  const selected = pickRandom(candidates);
  if (!selected) return false;
  const [square, piece] = selected;
  context.board.set(square, { side: piece.side, code: toCode, promoted: false });
  return true;
}

function summonRandomAdjacentEmptyPiece(context: SkillContext, pieceCode: string) {
  const center = parseSquare(context.move.to);
  const cells = adjacentEmptySquares(context.board, center);
  const square = pickRandom(cells);
  if (!square) return false;
  context.board.set(square, { side: context.actorSide, code: pieceCode, promoted: false });
  return true;
}

function summonOrthogonalAdjacentEmptyPieces(context: SkillContext, pieceCode: string) {
  const center = parseSquare(context.move.to);
  let count = 0;
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const row = center.row + dr;
    const col = center.col + dc;
    if (!isInsideBoard(row, col)) continue;
    const square = formatSquare(row, col);
    if (context.board.has(square) || isCellBlockedByHazard(context.skillState, row, col)) continue;
    context.board.set(square, { side: context.actorSide, code: pieceCode, promoted: false });
    count += 1;
  }
  return count > 0;
}

function pushOrthogonalAdjacentEnemiesToEdge(context: SkillContext) {
  const center = parseSquare(context.move.to);
  let pushed = false;
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const sourceRow = center.row + dr;
    const sourceCol = center.col + dc;
    if (!isInsideBoard(sourceRow, sourceCol)) continue;
    const source = formatSquare(sourceRow, sourceCol);
    const target = context.board.get(source);
    if (!target || target.side === context.actorSide) continue;
    let row = sourceRow;
    let col = sourceCol;
    while (isInsideBoard(row + dr, col + dc)) {
      const next = formatSquare(row + dr, col + dc);
      if (context.board.has(next) || isCellBlockedByHazard(context.skillState, row + dr, col + dc)) break;
      row += dr;
      col += dc;
    }
    if (row === sourceRow && col === sourceCol) continue;
    context.board.delete(source);
    const dest = formatSquare(row, col);
    context.board.set(dest, target);
    moveAttachedSkillState(context.skillState, target.side, source, dest);
    pushed = true;
  }
  return pushed;
}

function pushHorizontalAdjacentEnemiesOneStepAway(context: SkillContext) {
  const center = parseSquare(context.move.to);
  let pushed = false;
  for (const dc of [-1, 1] as const) {
    const sourceCol = center.col + dc;
    if (!isInsideBoard(center.row, sourceCol)) continue;
    const source = formatSquare(center.row, sourceCol);
    const target = context.board.get(source);
    if (!target || target.side === context.actorSide) continue;
    const destCol = sourceCol + dc;
    if (!isInsideBoard(center.row, destCol)) continue;
    const dest = formatSquare(center.row, destCol);
    if (context.board.has(dest) || isCellBlockedByHazard(context.skillState, center.row, destCol)) continue;
    context.board.delete(source);
    context.board.set(dest, target);
    moveAttachedSkillState(context.skillState, target.side, source, dest);
    pushed = true;
  }
  return pushed;
}

function warpHorizontalAdjacentEnemiesToRandomEmptyCell(context: SkillContext) {
  const center = parseSquare(context.move.to);
  const empties = allEmptySquares(context.board, context.skillState);
  let warped = false;
  for (const dc of [-1, 1] as const) {
    const sourceCol = center.col + dc;
    if (!isInsideBoard(center.row, sourceCol)) continue;
    const source = formatSquare(center.row, sourceCol);
    const target = context.board.get(source);
    if (!target || target.side === context.actorSide || empties.length === 0) continue;
    const dest = pickRandom(empties);
    if (!dest) continue;
    context.board.delete(source);
    context.board.set(dest, target);
    moveAttachedSkillState(context.skillState, target.side, source, dest);
    empties.splice(empties.indexOf(dest), 1);
    warped = true;
  }
  return warped;
}

function moveAdjacentAllySandWithLeader(context: SkillContext) {
  if (!context.fromSquare) return false;
  const from = parseSquare(context.fromSquare);
  const to = parseSquare(context.move.to);
  const deltaRow = to.row - from.row;
  const deltaCol = to.col - from.col;
  if (deltaRow === 0 && deltaCol === 0) return false;
  // 着手駒は既に to にいるため、連携対象は to 周囲の味方砂のみ（from 基準だと着手駒を二重移動させる）。
  // app.shogi と同様、移動対象を先に列挙してから一括反映する（逐次 forEachAdjacent だと連携砂が二重移動しうる）。
  const linkedSources: Array<{ source: string; ally: InternalPiece; row: number; col: number }> = [];
  forEachAdjacent(to, (row, col) => {
    const source = formatSquare(row, col);
    const ally = context.board.get(source);
    if (!ally || ally.side !== context.actorSide || canonicalPieceCode(ally.code) !== 'SAND') return;
    linkedSources.push({ source, ally, row, col });
  });
  let moved = false;
  for (const { source, ally, row, col } of linkedSources) {
    const destRow = row + deltaRow;
    const destCol = col + deltaCol;
    if (!isInsideBoard(destRow, destCol)) continue;
    const dest = formatSquare(destRow, destCol);
    if (context.board.has(dest) || isCellBlockedByHazard(context.skillState, destRow, destCol)) continue;
    context.board.delete(source);
    context.board.set(dest, ally);
    moveAttachedSkillState(context.skillState, ally.side, source, dest);
    moved = true;
  }
  return moved;
}

function moveAllyBehindBoatOneStep(context: SkillContext) {
  if (!context.fromSquare) return false;
  const from = parseSquare(context.fromSquare);
  const to = parseSquare(context.move.to);
  const deltaRow = to.row - from.row;
  const deltaCol = to.col - from.col;
  const behindRow = from.row - Math.sign(deltaRow);
  const behindCol = from.col - Math.sign(deltaCol);
  if (!isInsideBoard(behindRow, behindCol)) return false;
  const source = formatSquare(behindRow, behindCol);
  const ally = context.board.get(source);
  if (!ally || ally.side !== context.actorSide || ally.code === 'OU') return false;
  const destRow = behindRow + deltaRow;
  const destCol = behindCol + deltaCol;
  if (!isInsideBoard(destRow, destCol)) return false;
  const dest = formatSquare(destRow, destCol);
  if (context.board.has(dest) || isCellBlockedByHazard(context.skillState, destRow, destCol)) return false;
  context.board.delete(source);
  context.board.set(dest, ally);
  moveAttachedSkillState(context.skillState, ally.side, source, dest);
  return true;
}

function moveRandomAllyToCellBehindBird(context: SkillContext) {
  const to = parseSquare(context.move.to);
  const dBack = context.actorSide === 'black' ? 1 : -1;
  const behindRow = to.row + dBack;
  const behindCol = to.col;
  if (!isInsideBoard(behindRow, behindCol)) return false;
  const dest = formatSquare(behindRow, behindCol);
  if (context.board.has(dest) || isCellBlockedByHazard(context.skillState, behindRow, behindCol)) return false;
  const candidates = Array.from(context.board.entries()).filter(([square, piece]) => {
    if (square === context.move.to) return false;
    if (piece.side !== context.actorSide) return false;
    if (piece.code === 'OU') return false;
    if (piece.code === 'BIRD' || piece.code.toUpperCase().includes('29ECAB1EF3C3')) return false;
    return true;
  });
  const selected = pickRandom(candidates);
  if (!selected) return false;
  const [source, ally] = selected;
  context.board.delete(source);
  context.board.set(dest, ally);
  moveAttachedSkillState(context.skillState, ally.side, source, dest);
  return true;
}

function addRandomAdjacentHazard(
  context: SkillContext,
  hazardType: string,
  affectsSide: PlayerSide,
  durationTurns: number,
) {
  return addRandomAdjacentEmptyHazards(context, hazardType, affectsSide, durationTurns, 1);
}

function addRandomAdjacentEmptyHazards(
  context: SkillContext,
  hazardType: string,
  affectsSide: PlayerSide,
  durationTurns: number,
  maxCells: number,
) {
  const cells = adjacentEmptySquares(context.board, parseSquare(context.move.to));
  let placed = 0;
  while (cells.length > 0 && placed < maxCells) {
    const idx = Math.floor(Math.random() * cells.length);
    const square = cells.splice(idx, 1)[0];
    if (!square) continue;
    const { row, col } = parseSquare(square);
    context.skillState.board_hazards.push({
      row,
      col,
      hazard_type: hazardType,
      affects_side: affectsSide,
      remaining_turns: durationTurns,
    });
    placed += 1;
  }
  return placed > 0;
}

function addRandomOpponentCampPoisonCells(context: SkillContext, count: number, durationTurns: number) {
  const rows = context.actorSide === 'black' ? [0, 1, 2] : [6, 7, 8];
  const cells: string[] = [];
  for (const row of rows) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const square = formatSquare(row, col);
      if (!context.board.has(square)) cells.push(square);
    }
  }
  let placed = 0;
  while (cells.length > 0 && placed < count) {
    const square = cells.splice(Math.floor(Math.random() * cells.length), 1)[0];
    if (!square) continue;
    const { row, col } = parseSquare(square);
    context.skillState.board_hazards.push({
      row,
      col,
      hazard_type: 'poison_cell',
      affects_side: opposite(context.actorSide),
      remaining_turns: durationTurns,
    });
    placed += 1;
  }
  return placed > 0;
}

function addHorizontalHazards(context: SkillContext, hazardType: string, affectsSide: PlayerSide, durationTurns: number) {
  const center = parseSquare(context.move.to);
  let placed = false;
  for (const dc of [-1, 1] as const) {
    const col = center.col + dc;
    if (!isInsideBoard(center.row, col)) continue;
    const square = formatSquare(center.row, col);
    if (context.board.has(square)) continue;
    context.skillState.board_hazards.push({
      row: center.row,
      col,
      hazard_type: hazardType,
      affects_side: affectsSide,
      remaining_turns: durationTurns,
    });
    placed = true;
  }
  return placed;
}

function addVerticalHazards(context: SkillContext, hazardType: string, affectsSide: PlayerSide, durationTurns: number) {
  const center = parseSquare(context.move.to);
  let placed = false;
  for (const dr of [-1, 1] as const) {
    const row = center.row + dr;
    if (!isInsideBoard(row, center.col)) continue;
    const square = formatSquare(row, center.col);
    if (context.board.has(square)) continue;
    context.skillState.board_hazards.push({
      row,
      col: center.col,
      hazard_type: hazardType,
      affects_side: affectsSide,
      remaining_turns: durationTurns,
    });
    placed = true;
  }
  return placed;
}

function shouldTriggerSkillDefinition(definition: SkillDefinition): boolean {
  for (const condition of definition.conditions ?? []) {
    if (condition.type !== 'chance_roll') continue;
    const raw =
      typeof condition.params?.procChance === 'number'
        ? condition.params.procChance
        : typeof condition.params?.chance === 'number'
          ? condition.params.chance
          : null;
    if (raw == null || !Number.isFinite(raw)) continue;
    const procChance = raw > 1 && raw <= 100 ? raw / 100 : raw;
    if (procChance <= 0 || procChance >= 1) continue;
    if (!chance(procChance)) return false;
  }
  return true;
}

function hasAdjacentEnemyForSkill(
  board: InternalBoard,
  side: PlayerSide,
  square: string,
  excludeKing = true,
): boolean {
  const center = parseSquare(square);
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const row = center.row + dr;
      const col = center.col + dc;
      if (!isInsideBoard(row, col)) continue;
      const target = board.get(formatSquare(row, col));
      if (!target || target.side === side) continue;
      if (excludeKing && target.code === 'OU') continue;
      return true;
    }
  }
  return false;
}

const HOUSE_SUMMON_HOME_DEPTH = 4;

function isHousePieceForSkill(code: string, char?: string | null): boolean {
  const normalized = normalizeSkillPieceCode(code, char ?? undefined);
  return normalized === 'HOUSE' || char === '家';
}

function isPeoplePieceCode(code: string, char?: string | null): boolean {
  const normalized = normalizeSkillPieceCode(code, char ?? undefined);
  return normalized === 'PEOPLE' || char === '民';
}

function countPeopleOnBoard(board: InternalBoard, rules: RuleSnapshot, side: PlayerSide): number {
  let count = 0;
  for (const piece of board.values()) {
    if (piece.side !== side) continue;
    const pieceDef = resolvePieceDefinition(rules, piece);
    if (isPeoplePieceCode(piece.code, pieceDef?.char)) count += 1;
  }
  return count;
}

function generateHouseSkillOnlyMoves(
  state: InternalGameState,
  rules: RuleSnapshot,
  side: PlayerSide,
): NormalizedMove[] {
  if (countPeopleOnBoard(state.board, rules, side) >= 5) return [];
  const moves: NormalizedMove[] = [];
  for (const [square, piece] of state.board.entries()) {
    if (piece.side !== side) continue;
    if (isPieceImmobilized(state.skillState, state.board, rules, piece, square)) continue;
    const pieceDef = resolvePieceDefinition(rules, piece);
    if (!isHousePieceForSkill(piece.code, pieceDef?.char)) continue;
    moves.push({
      from: square,
      to: square,
      piece: piece.code,
      promote: false,
      drop: false,
      notation: 'house_skill_only',
    });
  }
  return moves;
}

function summonPeopleInHomeRandomEmpty(context: SkillContext, rules: RuleSnapshot): boolean {
  if (countPeopleOnBoard(context.board, rules, context.actorSide) >= 5) return false;
  const homeRows =
    context.actorSide === 'black'
      ? Array.from(
          { length: HOUSE_SUMMON_HOME_DEPTH },
          (_, index) => BOARD_SIZE - HOUSE_SUMMON_HOME_DEPTH + index,
        )
      : Array.from({ length: HOUSE_SUMMON_HOME_DEPTH }, (_, index) => index);
  const candidates: string[] = [];
  for (const row of homeRows) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const square = formatSquare(row, col);
      if (context.board.has(square)) continue;
      if (isCellBlockedByHazard(context.skillState, row, col)) continue;
      candidates.push(square);
    }
  }
  const targetSquare = pickRandom(candidates);
  if (!targetSquare) return false;
  context.board.set(targetSquare, { side: context.actorSide, code: 'PEOPLE', promoted: false });
  return true;
}

function tryPhantomEvadeCapture(
  board: InternalBoard,
  rules: RuleSnapshot,
  skillState: SkillState,
  capturedPiece: InternalPiece,
  capturePos: Square,
): string | null {
  const evadeChance = resolveEvadeCaptureProcChance(rules, capturedPiece);
  if (evadeChance == null) return null;
  const candidates = adjacentEmptySquares(board, capturePos).filter((square) => {
    const { row, col } = parseSquare(square);
    return !isCellBlockedByHazard(skillState, row, col);
  });
  if (candidates.length === 0) return null;
  if (!chance(evadeChance)) return null;
  return pickRandom(candidates);
}

function resolveEvadeCaptureProcChance(
  rules: RuleSnapshot,
  piece: InternalPiece,
): number | null {
  const pieceDef = resolvePieceDefinition(rules, piece);
  for (const definition of rules.skillDefinitions) {
    if (definition.trigger.type !== 'continuous_rule') continue;
    if (!skillDefinitionMatchesPiece(definition, piece, pieceDef)) continue;
    const hasEvade = definition.effects.some(
      (effect) =>
        effect.type === 'defense_or_immunity' &&
        asString(effect.params?.mode) === 'evade_capture',
    );
    if (!hasEvade) continue;
    for (const condition of definition.conditions ?? []) {
      if (condition.type !== 'chance_roll') continue;
      const raw =
        typeof condition.params?.procChance === 'number'
          ? condition.params.procChance
          : typeof condition.params?.chance === 'number'
            ? condition.params.chance
            : null;
      if (raw == null || !Number.isFinite(raw)) continue;
      if (raw > 1 && raw <= 100) return raw / 100;
      if (raw > 0 && raw < 1) return raw;
    }
    return 0.5;
  }
  return null;
}

function skillDefinitionMatchesPiece(
  definition: SkillDefinition,
  piece: InternalPiece,
  pieceDef: PieceDefinition | null,
): boolean {
  if (definition.pieceCodes?.some((code) => code.toUpperCase() === piece.code.toUpperCase())) {
    return true;
  }
  if (!pieceDef) return false;
  return definition.pieceChars?.includes(pieceDef.char) === true;
}

function generateTimeSkillOnlyMoves(
  state: InternalGameState,
  rules: RuleSnapshot,
  side: PlayerSide,
): NormalizedMove[] {
  const moves: NormalizedMove[] = [];
  for (const [square, piece] of state.board.entries()) {
    if (piece.side !== side) continue;
    if (isPieceImmobilized(state.skillState, state.board, rules, piece, square)) continue;
    const pieceDef = rules.piecesByCode[piece.code];
    const movedCode = normalizeSkillPieceCode(piece.code, pieceDef?.char);
    if (movedCode !== 'TIME') continue;
    if (!hasAdjacentEnemyForSkill(state.board, side, square, true)) continue;
    moves.push({
      from: square,
      to: square,
      piece: piece.code,
      promote: false,
      drop: false,
      notation: 'time_skill_only',
    });
  }
  return moves;
}

function hasChrysanthemumRevival(
  skillState: SkillState,
  side: PlayerSide,
  row: number,
  col: number,
): boolean {
  return skillState.piece_statuses.some((entry) => {
    if (asString(entry.status_type ?? entry.statusType) !== 'chrysanthemum_revival') return false;
    if (!active(entry)) return false;
    return asSide(entry.side) === side && asNumber(entry.row) === row && asNumber(entry.col) === col;
  });
}

function removeChrysanthemumRevivalAtCell(
  skillState: SkillState,
  side: PlayerSide,
  row: number,
  col: number,
) {
  skillState.piece_statuses = skillState.piece_statuses.filter((entry) => {
    if (asString(entry.status_type ?? entry.statusType) !== 'chrysanthemum_revival') return true;
    return !(asSide(entry.side) === side && asNumber(entry.row) === row && asNumber(entry.col) === col);
  });
}

function addChrysanthemumRevival(context: SkillContext) {
  const center = parseSquare(context.move.to);
  const allies: Array<{ square: string; row: number; col: number }> = [];
  forEachAdjacent(center, (row, col) => {
    const square = formatSquare(row, col);
    const piece = context.board.get(square);
    if (!piece || piece.side !== context.actorSide) return;
    if (piece.code === 'OU') return;
    if (piece.code === 'GIANT' || piece.code.toUpperCase().includes('GIANT')) return;
    allies.push({ square, row, col });
  });
  allies.sort((a, b) => a.row - b.row || a.col - b.col);
  const target = allies[0];
  if (!target) return false;
  context.skillState.piece_statuses.push({
    side: context.actorSide,
    row: target.row,
    col: target.col,
    status_type: 'chrysanthemum_revival',
    remaining_turns: 2,
  });
  return true;
}

function pushAdjacentPiecesOneStep(context: SkillContext) {
  const center = parseSquare(context.move.to);
  const planned = new Map<string, string>();
  const plannedDestinations = new Set<string>();
  forEachAdjacent(center, (row, col) => {
    const source = formatSquare(row, col);
    const piece = context.board.get(source);
    if (!piece) return;
    const dr = Math.sign(row - center.row);
    const dc = Math.sign(col - center.col);
    const destRow = row + dr;
    const destCol = col + dc;
    if (!isInsideBoard(destRow, destCol)) return;
    const dest = formatSquare(destRow, destCol);
    if (context.board.has(dest) || plannedDestinations.has(dest) || isCellBlockedByHazard(context.skillState, destRow, destCol)) return;
    planned.set(source, dest);
    plannedDestinations.add(dest);
  });
  for (const [source, dest] of planned.entries()) {
    const piece = context.board.get(source);
    if (!piece) continue;
    context.board.delete(source);
    context.board.set(dest, piece);
    moveAttachedSkillState(context.skillState, piece.side, source, dest);
  }
  return planned.size > 0;
}

function markKingSafeRoom(context: SkillContext, durationTurns: number) {
  const kingSquare = findKingSquare(context.board, context.actorSide);
  if (!kingSquare) return false;
  const { row, col } = parseSquare(kingSquare);
  context.skillState.board_hazards.push({
    row,
    col,
    hazard_type: 'safe_room_cell',
    affects_side: context.actorSide,
    remaining_turns: durationTurns,
  });
  return true;
}

function imprisonRandomBoardEdge(context: SkillContext, durationTurns: number) {
  const edge = pickRandom(HEN_EDGES);
  if (!edge) return false;
  context.skillState.board_hazards.push({
    hazard_type: 'hen_edge_highlight',
    edge,
    remaining_turns: durationTurns,
  });
  let applied = false;
  for (const [square, piece] of context.board.entries()) {
    const { row, col } = parseSquare(square);
    const onEdge =
      (edge === 'top' && row === 0) ||
      (edge === 'bottom' && row === 8) ||
      (edge === 'left' && col === 0) ||
      (edge === 'right' && col === 8);
    if (!onEdge) continue;
    context.skillState.piece_statuses.push({
      row,
      col,
      side: piece.side,
      status_type: 'stun',
      remaining_turns: durationTurns,
    });
    applied = true;
  }
  return applied;
}

function moveKingSameVector(context: SkillContext) {
  if (!context.fromSquare) return false;
  const from = parseSquare(context.fromSquare);
  const to = parseSquare(context.move.to);
  const dr = Math.sign(to.row - from.row);
  const dc = Math.sign(to.col - from.col);
  if (dr === 0 && dc === 0) return false;
  const kingSquare = findKingSquare(context.board, context.actorSide);
  if (!kingSquare) return false;
  const king = context.board.get(kingSquare);
  if (!king) return false;
  const kingPos = parseSquare(kingSquare);
  const destRow = kingPos.row + dr;
  const destCol = kingPos.col + dc;
  if (!isInsideBoard(destRow, destCol)) return false;
  const dest = formatSquare(destRow, destCol);
  if (context.board.has(dest) || isCellBlockedByHazard(context.skillState, destRow, destCol)) return false;
  context.board.delete(kingSquare);
  context.board.set(dest, king);
  moveAttachedSkillState(context.skillState, king.side, kingSquare, dest);
  return true;
}

function applyScriptedPieceSkills(rules: RuleSnapshot, context: SkillContext) {
  let applied = false;
  const pieceDef = resolvePieceDefinition(rules, context.movedPiece);
  const resolvedCode =
    (pieceDef ? resolveGamePieceCode(pieceDef) : null) ??
    resolveGamePieceCodeFromRules(rules, context.movedPiece.code) ??
    context.movedPiece.code;
  const movedCode = effectiveMovedSkillCode(
    rules,
    context.board.values(),
    context.movedPiece,
    pieceDef,
    normalizeSkillPieceCode(resolvedCode, pieceDef?.char),
  );
  const yinSuppress = isActorSkillProcSuppressedByAdjacentEnemyYin(
    context.board,
    rules,
    context.actorSide,
    context.movedPiece,
    context.move.to,
  );
  const yangFactor = computeYangSkillProcFactorForMover(
    context.board,
    rules,
    context.actorSide,
    context.movedPiece,
    context.move.to,
  );
  const rollChance = (probability: number) => {
    if (yinSuppress) return false;
    return Math.random() <= applyYangAllySkillProcMultiplier(probability, yangFactor);
  };
  if (!context.move.drop && context.fromSquare) {
    if (yinSuppress) {
      return applied;
    }
    if (movedCode === 'FLAME' || movedCode === 'ENN') {
      applied = rollChance(0.2) && removeRandomAdjacentEnemyPiece(context) || applied;
    }
    if (movedCode === 'FIRE' || movedCode === 'FIR') {
      applied =
        rollChance(0.2) && decrementRandomHandPieces(context.hands, opposite(context.actorSide), 1) || applied;
    }
    if (movedCode === 'TREASURE') {
      if (rollChance(0.2)) {
        incrementHand(context.hands, context.actorSide, pickRandom(TREASURE_REWARD_CODES) ?? 'KI');
        applied = true;
      }
    }
    if (movedCode === 'SPRING') {
      applied =
        grantRandomAllySpringImmunity({
          board: context.board.entries(),
          skillState: context.skillState,
          rules,
          actorSide: context.actorSide,
          excludeSquare: context.move.to,
          parseSquare,
          pickRandom,
        }) || applied;
    }
    if (movedCode === 'WATER' || movedCode === 'SUI' || movedCode === 'IRON' || movedCode === 'WAVE' || movedCode === 'NAM') {
      applied = pushAdjacentEnemyPiecesOneStep(context) || applied;
    }
    if (movedCode === 'SAND') {
      applied = moveAdjacentAllySandWithLeader(context) || applied;
    }
    if (movedCode === 'BOAT') {
      applied = moveAllyBehindBoatOneStep(context) || applied;
    }
    if (movedCode === 'BIRD' || movedCode.includes('29ECAB1EF3C3')) {
      applied = moveRandomAllyToCellBehindBird(context) || applied;
    }
    if (movedCode === 'WIND') {
      applied = pushOrthogonalAdjacentEnemiesToEdge(context) || applied;
    }
    if (movedCode === 'FISH') {
      applied = rollChance(0.3) && applyRandomAdjacentEnemyStatus(context, 'stun', 3) || applied;
    }
    if (movedCode === 'MOSS') {
      applied = rollChance(0.3) && summonRandomAdjacentEmptyPiece(context, 'MOSS') || applied;
    }
    if (movedCode === 'RAINBOW') {
      applied = applyAdjacentMovementModifier(context, 'orthogonal_step_only', 4) || applied;
    }
    if (movedCode === 'BLUEONI') {
      applied = applyAdjacentMovementModifier(context, 'orthogonal_step_only', 2) || applied;
    }
    if (movedCode === 'SWAMP') {
      applied = applyAdjacentMovementModifier(context, 'vertical_step_only', 2) || applied;
    }
    if (movedCode === 'MAI' || movedCode === 'SHOP_MAI') {
      applied =
        applyAdjacentMovementModifier(context, 'diagonal_forward_step_only', 999) || applied;
    }
    if (movedCode === 'POISON') {
      context.skillState.board_hazards.push({
        row: parseSquare(context.fromSquare).row,
        col: parseSquare(context.fromSquare).col,
        hazard_type: 'poison_cell',
        affects_side: opposite(context.actorSide),
        remaining_turns: 4,
      });
      applied = true;
    }
    if (movedCode === 'WATERFALL') {
      applied = rollChance(0.2) && sendAllAdjacentEnemiesToOwnerHands(context) || applied;
    }
    if (movedCode === 'A') {
      applied = transformAdjacentEnemies(context, 'FU') || applied;
    }
    if (movedCode === 'EXPERIMENT') {
      applied = transformAdjacentEnemiesToMutant(context) || applied;
    }
    if (movedCode === 'TIN') {
      if (rollChance(0.1)) {
        applied = applyAdjacentEnemyStatus(context, 'stun', 2) || applied;
      }
    }
    if (
      movedCode === 'TIME' &&
      (context.move.notation === 'time_skill_only' || context.move.notation === 'time_skill')
    ) {
      applied = applyAdjacentEnemyStatus(context, 'stun', 4) || applied;
    }
    if (context.move.notation === 'house_skill_only' && isHousePieceForSkill(movedCode, pieceDef?.char)) {
      applied = summonPeopleInHomeRandomEmpty(context, rules) || applied;
    }
    if (movedCode === 'BEAST') {
      applied = applyOrthogonalAdjacentEnemyStatus(context, 'stun', 2) || applied;
    }
    if (movedCode === 'ELECTRIC') {
      if (rollChance(0.2)) {
        applied = applyAdjacentEnemyStatus(context, 'stun', 2) || applied;
      }
    }
    if (movedCode === 'THUNDER') {
      if (rollChance(0.1)) {
        applied = decrementRandomHandPieces(context.hands, opposite(context.actorSide), 2) || applied;
      }
    }
    if (movedCode === 'ICE') {
      applied = rollChance(0.3) && applyRandomAdjacentEnemyStatus(context, 'stun', 2) || applied;
    }
    if (movedCode === 'SNOW') {
      if (rollChance(0.2)) {
        incrementHand(context.hands, context.actorSide, 'ICE');
        applied = true;
      }
    }
    if (movedCode === 'WOOD' || movedCode === 'MOK') {
      applied = rollChance(0.1) && summonRandomAdjacentEmptyPiece(context, 'MOK') || applied;
    }
    if (movedCode === 'LEAF' || movedCode === 'HAA') {
      applied = rollChance(0.1) && summonRandomAdjacentEmptyPiece(context, 'HAA') || applied;
    }
    if (movedCode === 'TANE' || movedCode === 'SHOP_TANE') {
      applied = rollChance(0.2) && summonRandomAdjacentEmptyPiece(context, 'HAA') || applied;
    }
    if (movedCode === 'BULL') {
      applied = rollChance(0.1) && summonOrthogonalAdjacentEmptyPieces(context, 'BULL') || applied;
    }
    if (movedCode === 'BIGNOISE') {
      applied = warpHorizontalAdjacentEnemiesToRandomEmptyCell(context) || applied;
    }
    if (movedCode === 'REDONI') {
      applied = pushHorizontalAdjacentEnemiesOneStepAway(context) || applied;
      applied = addRandomAdjacentHazard(context, 'pit_cell', opposite(context.actorSide), 2) || applied;
    }
    if (movedCode === 'BLACKONI') {
      applied = addRandomOpponentCampPoisonCells(context, 3, 2) || applied;
    }
    if (movedCode === 'DEMON' || movedCode === 'MAK') {
      applied = rollChance(0.1) && removeUpToRandomAdjacentEnemyPieces(context, 2) || applied;
    }
    if (movedCode === 'TATSU') {
      applied = rollChance(0.1) && removeUpToRandomAdjacentEnemyPieces(context, 1) || applied;
    }
    if (movedCode === 'DARK' || movedCode === 'YAM') {
      applied = applyAdjacentEnemyStatus(context, 'dark_blind', 2) || applied;
    }
    if (movedCode === 'PRISON' || movedCode === 'FENCE') {
      applied = applyRandomEnemyStatus(context, 'prison_fence_stun', 2) || applied;
    }
    if (movedCode === 'RIDGE') {
      applied = rollChance(0.2) && summonRandomAdjacentEmptyPiece(context, 'YAMA') || applied;
    }
    if (movedCode === 'KBOSS') {
      applied = rollChance(0.4) && summonRandomAdjacentEmptyPiece(context, 'EXPERIMENT') || applied;
    }
    if (movedCode === 'ORE') {
      applied = rollChance(0.2) && transformRandomAllyPawn(context, pickRandom(TREASURE_REWARD_CODES) ?? 'KI') || applied;
    }
    if (movedCode === 'GRAVE') {
      applied = rollChance(0.2) && summonRandomAdjacentEmptyPiece(context, 'SPIRIT') || applied;
    }
    if (movedCode === 'ROCK') {
      applied = addHorizontalHazards(context, 'rock_obstacle', context.actorSide, 2) || applied;
    }
    if (movedCode === 'DEPRESSION') {
      applied = addHorizontalHazards(context, 'pit_cell', opposite(context.actorSide), 2) || applied;
    }
    if (movedCode === 'ROSE') {
      applied = addVerticalHazards(context, 'thorn_cell', opposite(context.actorSide), 2) || applied;
    }
    if (movedCode === 'CHRYSANTHEMUM') {
      applied = addChrysanthemumRevival(context) || applied;
    }
    if (movedCode === 'GACHA_BAKU') {
      applied = pushAdjacentPiecesOneStep(context) || applied;
    }
    if (movedCode === 'GACHA_SHITSU') {
      applied = rollChance(0.3) && markKingSafeRoom(context, 2) || applied;
    }
    if (movedCode === 'GACHA_SADAME') {
      context.skillState.piece_statuses.push({
        row: parseSquare(context.move.to).row,
        col: parseSquare(context.move.to).col,
        side: context.actorSide,
        status_type: 'opponent_turn_max_piece_cost',
        max_piece_cost: 5,
        remaining_turns: 1,
      });
      applied = true;
    }
    if (movedCode === 'GACHA_AN') {
      applied = rollChance(0.1) && transformRandomEnemySpecialToPawn(context) || applied;
    }
    if (movedCode === 'GACHA_SO') {
      applied = rollChance(0.2) && summonRandomAdjacentEmptyPiece(context, 'KI') || applied;
    }
    if (movedCode === 'GACHA_TOU') {
      applied = rollChance(0.2) && transformRandomAllyPawn(context, 'FIR') || applied;
    }
    if (movedCode === 'GACHA_HEN') {
      applied = imprisonRandomBoardEdge(context, 2) || applied;
    }
    if (movedCode === 'GACHA_ITSU') {
      applied = rollChance(0.3) && sendRandomEnemyToOwnerHand(context) || applied;
    }
    if (movedCode === 'GACHA_TOU2') {
      applied = moveKingSameVector(context) || applied;
    }
    if (movedCode === 'GACHA_SOU') {
      applied = addRandomAdjacentEmptyHazards(context, 'pit_cell', opposite(context.actorSide), 2, 3) || applied;
    }
    applied = moveAdjacentAllyKoGlueFollowLeader(context) || applied;
  }
  return applied;
}

function pushAdjacentEnemyPiecesOneStep(context: SkillContext) {
  const center = parseSquare(context.move.to);
  const enemy = opposite(context.actorSide);
  const occupied = new Set(context.board.keys());
  const planned = new Map<string, string>();
  const plannedDestinations = new Set<string>();

  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const row = center.row + dr;
      const col = center.col + dc;
      if (!isInsideBoard(row, col)) continue;
      const from = formatSquare(row, col);
      const target = context.board.get(from);
      if (!target || target.side !== enemy) continue;
      const toRow = row + Math.sign(dr);
      const toCol = col + Math.sign(dc);
      if (!isInsideBoard(toRow, toCol)) continue;
      const to = formatSquare(toRow, toCol);
      if (occupied.has(to) || plannedDestinations.has(to)) continue;
      planned.set(from, to);
      plannedDestinations.add(to);
    }
  }

  for (const [from, to] of planned.entries()) {
    const piece = context.board.get(from);
    if (!piece) continue;
    context.board.delete(from);
    context.board.set(to, piece);
    moveAttachedSkillState(context.skillState, piece.side, from, to);
  }

  return planned.size > 0;
}

function applyAdjacentMovementModifier(context: SkillContext, movementRule: string, durationTurns: number) {
  const center = parseSquare(context.move.to);
  const enemy = opposite(context.actorSide);
  let count = 0;
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const row = center.row + dr;
      const col = center.col + dc;
      if (!isInsideBoard(row, col)) continue;
      const target = context.board.get(formatSquare(row, col));
      if (!target || target.side !== enemy) continue;
      context.skillState.movement_modifiers.push({
        row,
        col,
        side: target.side,
        movement_rule: movementRule,
        remaining_turns: durationTurns,
      });
      count += 1;
    }
  }
  return count > 0;
}

function moveAdjacentAllyKoGlueFollowLeader(context: SkillContext) {
  if (!context.fromSquare) return false;
  const from = parseSquare(context.fromSquare);
  const to = parseSquare(context.move.to);
  const deltaRow = to.row - from.row;
  const deltaCol = to.col - from.col;
  if (deltaRow !== 0 || Math.abs(deltaCol) !== 1) return false;
  const planned = new Map<string, string>();
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const row = from.row + dr;
      const col = from.col + dc;
      if (!isInsideBoard(row, col)) continue;
      const source = formatSquare(row, col);
      const piece = context.board.get(source);
      if (!piece || piece.side !== context.actorSide || !isKoGluePiece(piece.code)) continue;
      const destRow = row + deltaRow;
      const destCol = col + deltaCol;
      if (!isInsideBoard(destRow, destCol)) continue;
      const dest = formatSquare(destRow, destCol);
      if (context.board.has(dest) || planned.has(dest)) continue;
      planned.set(source, dest);
    }
  }
  for (const [source, dest] of planned.entries()) {
    const piece = context.board.get(source);
    if (!piece) continue;
    context.board.delete(source);
    context.board.set(dest, piece);
    moveAttachedSkillState(context.skillState, piece.side, source, dest);
  }
  return planned.size > 0;
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
    const targets = getMovementTargets(
      board,
      createEmptySkillState(),
      rules,
      attacker,
      parseSquare(square),
      definition,
      piece.promoted,
      piece.code,
      0,
      square,
    );
    if (targets.some((target) => formatSquare(target.row, target.col) === targetSquare)) return true;
  }
  return false;
}

function isIllegalPawnDropMate(state: InternalGameState, rules: RuleSnapshot, defender: PlayerSide) {
  if (!isKingInCheck(state.board, rules, defender)) return false;
  return generateLegalMoves(state, rules, defender).length === 0;
}

function resolvePieceDefinition(rules: RuleSnapshot, piece: InternalPiece) {
  const direct =
    rules.piecesByCode[piece.code] ??
    rules.piecesByCode[canonicalPieceCode(piece.code)] ??
    Object.values(rules.piecesByCode).find((def) => def.pieceCode.toUpperCase() === piece.code);
  if (direct) return direct;

  const upper = piece.code.trim().toUpperCase();
  return (
    Object.values(rules.piecesByCode).find((def) => def.sfenCode?.trim().toUpperCase() === upper) ??
    Object.values(rules.piecesByCode).find((def) => def.canonicalCode?.trim().toUpperCase() === upper) ??
    null
  );
}

function createEmptySkillState(): SkillState {
  return {
    board_hazards: [],
    board_arrow_tiles: [],
    movement_modifiers: [],
    piece_statuses: [],
    piece_defenses: [],
  };
}

function parseSkillState(raw: GameSnapshot['skillState']): SkillState {
  return {
    board_hazards: arrayOfRecords(raw?.board_hazards),
    board_arrow_tiles: arrayOfRecords(raw?.board_arrow_tiles),
    movement_modifiers: arrayOfRecords(raw?.movement_modifiers),
    piece_statuses: arrayOfRecords(raw?.piece_statuses),
    piece_defenses: arrayOfRecords(raw?.piece_defenses),
    ...(raw?.last_player_moved_piece && typeof raw.last_player_moved_piece === 'object'
      ? { last_player_moved_piece: { ...raw.last_player_moved_piece } }
      : {}),
    ...(raw?.last_enemy_moved_piece && typeof raw.last_enemy_moved_piece === 'object'
      ? { last_enemy_moved_piece: { ...raw.last_enemy_moved_piece } }
      : {}),
  };
}

function cloneSkillState(skillState: SkillState): SkillState {
  return {
    board_hazards: skillState.board_hazards.map((entry) => ({ ...entry })),
    board_arrow_tiles: skillState.board_arrow_tiles.map((entry) => ({ ...entry })),
    movement_modifiers: skillState.movement_modifiers.map((entry) => ({ ...entry })),
    piece_statuses: skillState.piece_statuses.map((entry) => ({ ...entry })),
    piece_defenses: skillState.piece_defenses.map((entry) => ({ ...entry })),
    ...(skillState.last_player_moved_piece
      ? { last_player_moved_piece: { ...skillState.last_player_moved_piece } }
      : {}),
    ...(skillState.last_enemy_moved_piece
      ? { last_enemy_moved_piece: { ...skillState.last_enemy_moved_piece } }
      : {}),
  };
}

function arrayOfRecords(raw: unknown): Record<string, unknown>[] {
  return Array.isArray(raw)
    ? raw.filter((entry): entry is Record<string, unknown> => isRecord(entry)).map((entry) => ({ ...entry }))
    : [];
}

function isPieceImmobilized(
  skillState: SkillState,
  board: InternalBoard,
  rules: RuleSnapshot,
  piece: InternalPiece,
  square: string,
) {
  if (piece.code === 'OU') return false;
  const position = parseSquare(square);
  if (isCellAdjacentToAnySaint(board, rules, position.row, position.col, formatSquare)) {
    return true;
  }
  return skillState.piece_statuses.some((entry) => {
    const statusType = asString(entry.status_type ?? entry.statusType);
    if (
      statusType !== 'stun' &&
      statusType !== 'abyss_stun' &&
      statusType !== 'time_stop' &&
      statusType !== 'dark_blind' &&
      statusType !== 'prison_fence_stun' &&
      statusType !== 'peak_lock' &&
      statusType !== 'seal_immobilize'
    ) {
      return false;
    }
    return (
      active(entry) &&
      asSide(entry.side) === piece.side &&
      asNumber(entry.row) === position.row &&
      asNumber(entry.col) === position.col
    );
  });
}

function isCaptureBlocked(skillState: SkillState, piece: InternalPiece, square: string) {
  const position = parseSquare(square);
  return (
    skillState.piece_defenses.some(
      (entry) =>
        active(entry) &&
        asString(entry.mode) === 'immunity' &&
        asSide(entry.side) === piece.side &&
        asNumber(entry.row) === position.row &&
        asNumber(entry.col) === position.col,
    ) ||
    skillState.piece_statuses.some(
      (entry) =>
        active(entry) &&
        asString(entry.status_type ?? entry.statusType) === 'dark_blind' &&
        asSide(entry.side) === piece.side &&
        asNumber(entry.row) === position.row &&
        asNumber(entry.col) === position.col,
    )
  );
}

function isKingBlockedByPoisonCell(
  skillState: SkillState,
  side: PlayerSide,
  pieceCode: string,
  row: number,
  col: number,
) {
  if (!pieceCode || canonicalPieceCode(pieceCode) !== 'OU') return false;
  return skillState.board_hazards.some((entry) => {
    const type = asString(entry.hazard_type ?? entry.hazardType);
    if (type !== 'poison_cell' && type !== 'poison') return false;
    if (!active(entry)) return false;
    if (asNumber(entry.row) !== row || asNumber(entry.col) !== col) return false;
    return asSide(entry.affects_side ?? entry.affectsSide) === side;
  });
}

function isCellBlockedByHazard(skillState: SkillState, row: number, col: number) {
  return skillState.board_hazards.some((entry) => {
    const type = asString(entry.hazard_type ?? entry.hazardType);
    return (
      active(entry) &&
      (type === 'rock_obstacle' || type === 'pit_cell') &&
      asNumber(entry.row) === row &&
      asNumber(entry.col) === col
    );
  });
}

function isDropBlockedBySkillState(skillState: SkillState, side: PlayerSide, row: number, col: number) {
  return skillState.board_hazards.some((entry) => {
    const type = asString(entry.hazard_type ?? entry.hazardType);
    return (
      active(entry) &&
      (type === 'rock_obstacle' ||
        type === 'pit_cell' ||
        (type === 'thorn_cell' && asSide(entry.affects_side ?? entry.affectsSide) === side)) &&
      asNumber(entry.row) === row &&
      asNumber(entry.col) === col
    );
  });
}

function applyPassiveSkillAuras(skillState: SkillState, board: InternalBoard, rules: RuleSnapshot) {
  skillState.piece_statuses = skillState.piece_statuses.filter((entry) => {
    const statusType = asString(entry.status_type ?? entry.statusType);
    return statusType !== 'peak_lock';
  });
  const peakSides = new Set<PlayerSide>();
  for (const piece of board.values()) {
    if (canonicalPieceCode(piece.code) === 'PEAK') peakSides.add(piece.side);
  }
  if (peakSides.size > 0) {
    for (const [square, piece] of board.entries()) {
      if (!peakSides.has(opposite(piece.side))) continue;
      if (piece.code === 'OU' || STANDARD_CODES.has(canonicalPieceCode(piece.code))) continue;
      const { row, col } = parseSquare(square);
      skillState.piece_statuses.push({
        row,
        col,
        side: piece.side,
        status_type: 'peak_lock',
        remaining_turns: 1,
      });
    }
  }
  applySealPassiveImmobilization({
    board,
    rules,
    skillState,
    formatSquare,
    parseSquare,
  });
}

function applyMutantReverts(board: InternalBoard) {
  for (const [square, piece] of board.entries()) {
    if (piece.code !== 'MUTANT' || !piece.mutantRevertCode) continue;
    const pos = parseSquare(square);
    const adjacentEnemyExperiment = Array.from(board.entries()).some(([otherSquare, other]) => {
      if (other.side === piece.side || canonicalPieceCode(other.code) !== 'EXPERIMENT') return false;
      const otherPos = parseSquare(otherSquare);
      return Math.abs(otherPos.row - pos.row) <= 1 && Math.abs(otherPos.col - pos.col) <= 1;
    });
    if (!adjacentEnemyExperiment) {
      board.set(square, { side: piece.side, code: piece.mutantRevertCode, promoted: false });
    }
  }
}

function adjacentEnemySquares(context: SkillContext, center: Square, excludeKing: boolean) {
  const out: string[] = [];
  forEachAdjacent(center, (row, col) => {
    const square = formatSquare(row, col);
    const piece = context.board.get(square);
    if (!piece || piece.side === context.actorSide) return;
    if (excludeKing && piece.code === 'OU') return;
    out.push(square);
  });
  return out;
}

function adjacentEmptySquares(board: InternalBoard, center: Square) {
  const out: string[] = [];
  forEachAdjacent(center, (row, col) => {
    const square = formatSquare(row, col);
    if (!board.has(square)) out.push(square);
  });
  return out;
}

function allEmptySquares(board: InternalBoard, skillState: SkillState) {
  const out: string[] = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const square = formatSquare(row, col);
      if (!board.has(square) && !isCellBlockedByHazard(skillState, row, col)) out.push(square);
    }
  }
  return out;
}

function forEachAdjacent(center: Square, fn: (row: number, col: number) => void) {
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const row = center.row + dr;
      const col = center.col + dc;
      if (!isInsideBoard(row, col)) continue;
      fn(row, col);
    }
  }
}

function pickRandom<T>(items: readonly T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function chance(probability: number) {
  return Math.random() <= probability;
}

function decrementFirstHandPiece(hands: InternalHands, side: PlayerSide) {
  const key = Object.keys(hands[side])
    .sort()
    .find((pieceCode) => (hands[side][pieceCode] ?? 0) > 0);
  if (!key) return false;
  decrementHand(hands, side, key);
  return true;
}

function decrementRandomHandPieces(hands: InternalHands, side: PlayerSide, maxCount: number) {
  let removed = 0;
  for (let i = 0; i < maxCount; i += 1) {
    const keys = Object.keys(hands[side]).filter((pieceCode) => (hands[side][pieceCode] ?? 0) > 0);
    const key = pickRandom(keys);
    if (!key) break;
    decrementHand(hands, side, key);
    removed += 1;
  }
  return removed > 0;
}

function isChebyshevAdjacent(aRow: number, aCol: number, bRow: number, bCol: number): boolean {
  const dr = Math.abs(aRow - bRow);
  const dc = Math.abs(aCol - bCol);
  return dr <= 1 && dc <= 1 && (dr !== 0 || dc !== 0);
}

function isMaiSkillPieceCode(pieceCode: string): boolean {
  const normalized = normalizeSkillPieceCode(pieceCode);
  return normalized === 'MAI' || normalized === 'SHOP_MAI';
}

/** 舞の移動制限は、盤上の味方「舞」の周囲8マスにいる敵にだけ効く（app.shogi と同じ）。 */
function pruneDanceMovementModifiersNotAdjacentToMai(
  modifiers: Record<string, unknown>[],
  board: InternalBoard,
): Record<string, unknown>[] {
  const maiPositions: { side: PlayerSide; row: number; col: number }[] = [];
  for (const [square, piece] of board.entries()) {
    if (!isMaiSkillPieceCode(piece.code)) continue;
    const pos = parseSquare(square);
    maiPositions.push({ side: piece.side, row: pos.row, col: pos.col });
  }
  return modifiers.filter((entry) => {
    const rule = asString(entry.movement_rule ?? entry.movementRule) ?? '';
    if (rule !== 'diagonal_forward_step_only') return true;
    const side = asSide(entry.side);
    const row = asNumber(entry.row);
    const col = asNumber(entry.col);
    if (row == null || col == null) return false;
    if (maiPositions.length === 0) return false;
    return maiPositions.some(
      (mai) => mai.side !== side && isChebyshevAdjacent(mai.row, mai.col, row, col),
    );
  });
}

function filterByMovementModifier(
  targets: Square[],
  skillState: SkillState,
  side: PlayerSide,
  source: Square,
  pieceCode: string,
  board: InternalBoard,
  rules: RuleSnapshot,
) {
  if (pieceCode === 'OU') return targets;
  const danceAwareModifiers = pruneDanceMovementModifiersNotAdjacentToMai(
    skillState.movement_modifiers,
    board,
  );
  const modifier = danceAwareModifiers.find(
    (entry) =>
      active(entry) &&
      asSide(entry.side) === side &&
      asNumber(entry.row) === source.row &&
      asNumber(entry.col) === source.col,
  );
  const rule = asString(modifier?.movement_rule ?? modifier?.movementRule);
  if (!rule) return targets;
  const peopleFieldBuff = peopleFieldBuffActive(board, rules, side, pieceCode);
  return targets.filter((target) => {
    const dr = target.row - source.row;
    const dc = target.col - source.col;
    if (rule === 'orthogonal_step_only') {
      if (Math.abs(dr) + Math.abs(dc) === 1) return true;
      return peopleFieldBuff && Math.abs(dr) === 1 && Math.abs(dc) === 1;
    }
    if (rule === 'vertical_step_only') return dc === 0 && Math.abs(dr) === 1;
    if (rule === 'diagonal_forward_step_only') {
      return dr === orientRowDelta(side, -1) && Math.abs(dc) === 1;
    }
    return true;
  });
}

function applyPoisonHazardsOnLanding(
  skillState: SkillState,
  board: InternalBoard,
  actorSide: PlayerSide,
  square: string,
) {
  const landed = board.get(square);
  if (!landed || landed.side !== actorSide || landed.code === 'OU') return false;
  const position = parseSquare(square);
  const lethal = skillState.board_hazards.some((entry) => {
    const type = asString(entry.hazard_type ?? entry.hazardType);
    return (
      active(entry) &&
      (type === 'poison_cell' || type === 'poison') &&
      asSide(entry.affects_side ?? entry.affectsSide) === actorSide &&
      asNumber(entry.row) === position.row &&
      asNumber(entry.col) === position.col
    );
  });
  if (!lethal) return false;
  board.delete(square);
  return true;
}

function moveAttachedSkillState(skillState: SkillState, side: PlayerSide, fromSquare: string, toSquare: string) {
  const from = parseSquare(fromSquare);
  const to = parseSquare(toSquare);
  for (const list of [skillState.movement_modifiers, skillState.piece_statuses, skillState.piece_defenses]) {
    for (const entry of list) {
      if (asSide(entry.side) !== side) continue;
      if (asNumber(entry.row) !== from.row || asNumber(entry.col) !== from.col) continue;
      entry.row = to.row;
      entry.col = to.col;
    }
  }
}

function tickSkillStateDurations(skillState: SkillState) {
  skillState.board_hazards = tickSkillList(skillState.board_hazards);
  skillState.board_arrow_tiles = tickSkillList(skillState.board_arrow_tiles);
  skillState.movement_modifiers = tickSkillList(skillState.movement_modifiers);
  skillState.piece_statuses = tickSkillList(skillState.piece_statuses);
  skillState.piece_defenses = tickSkillList(skillState.piece_defenses);
}

function tickSkillList(list: Record<string, unknown>[]) {
  const out: Record<string, unknown>[] = [];
  for (const entry of list) {
    if (entry.permanent === true || entry.stage_fixed === true) {
      out.push(entry);
      continue;
    }
    const remaining = asNumber(entry.remaining_turns ?? entry.remainingTurns) ?? 0;
    if (remaining >= 999) {
      out.push(entry);
      continue;
    }
    if (remaining <= 0) continue;
    const statusType = asString(entry.status_type ?? entry.statusType) ?? '';
    const next = remaining - 1;
    if (next <= 0) {
      if (statusType === 'death_curse') {
        out.push({ ...entry, remaining_turns: 0 });
      }
      continue;
    }
    out.push({ ...entry, remaining_turns: next });
  }
  return out;
}

function normalizeSkillPieceCode(raw: string, char?: string | null) {
  return normalizePortedSkillPieceCode(raw, char);
}

function canonicalPieceCode(raw: string) {
  const normalized = normalizeSkillPieceCode(raw);
  if (normalized === 'WATER') return 'SUI';
  if (normalized === 'GACHA_KO') return 'GACHA_KOU';
  return normalized;
}

function isKoGluePiece(pieceCode: string) {
  const normalized = normalizeSkillPieceCode(pieceCode);
  return normalized === 'GACHA_KOU' || normalized === 'KO';
}

function active(entry: Record<string, unknown>) {
  return (asNumber(entry.remaining_turns ?? entry.remainingTurns) ?? 0) > 0;
}

function asSide(raw: unknown): PlayerSide {
  if (raw === 'white' || raw === 'enemy') return 'white';
  return 'black';
}

function asNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asString(raw: unknown): string | null {
  return typeof raw === 'string' ? raw : null;
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw);
}

function findKingSquare(board: InternalBoard, side: PlayerSide) {
  for (const [square, piece] of board.entries()) {
    if (piece.side === side && canonicalPieceCode(piece.code) === 'OU') return square;
  }
  return null;
}

/** 味方王の「前」1マス（black は row-1、white は row+1）。 */
function allyKingForwardSquare(board: InternalBoard, side: PlayerSide): Square | null {
  const kingSquare = findKingSquare(board, side);
  if (!kingSquare) return null;
  const king = parseSquare(kingSquare);
  const row = king.row + orientRowDelta(side, -1);
  const col = king.col;
  if (!isInsideBoard(row, col)) return null;
  return { row, col };
}

/** 閹: 味方王の前1マス（通常の縦横1マスに加えて合法手に含める）。 */
function enAllyKingFrontTarget(
  board: InternalBoard,
  side: PlayerSide,
  source: Square,
): Square | null {
  const cell = allyKingForwardSquare(board, side);
  if (!cell) return null;
  if (cell.row === source.row && cell.col === source.col) return null;
  return cell;
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
  const promoted = piece.promoted ? '+' : '';
  const stage45Suffix = encodeStage45PieceSuffixes(piece);
  return `${piece.side}:${piece.code}${promoted}${stage45Suffix}`;
}

function decodePiece(raw: string): InternalPiece | null {
  const [sideRaw, codeRaw] = raw.split(':');
  if ((sideRaw !== 'black' && sideRaw !== 'white') || !codeRaw) return null;
  const decoded = decodeStage45PieceCodePart(codeRaw);
  return {
    side: sideRaw,
    code: decoded.code,
    promoted: decoded.promoted,
    pigInheritedCode: decoded.pigInheritedCode,
    pigInheritedPromoted: decoded.pigInheritedPromoted,
    cowChargeCount: decoded.cowChargeCount,
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

function incrementHand(
  hands: InternalHands,
  side: PlayerSide,
  pieceCode: string,
  rules?: RuleSnapshot,
) {
  const code = rules
    ? (resolveGamePieceCodeFromRules(rules, pieceCode) ?? pieceCode.trim().toUpperCase())
    : pieceCode.trim().toUpperCase();
  hands[side][code] = (hands[side][code] ?? 0) + 1;
}

const PROMOTED_CAPTURE_TO_HAND_CODE: Record<string, string> = {
  TO: 'FU',
  NY: 'KY',
  NK: 'KE',
  NG: 'GI',
  UM: 'KA',
  RY: 'HI',
};

function capturedPieceToHandCode(rules: RuleSnapshot, piece: InternalPiece): string {
  let code = resolveGamePieceCodeFromRules(rules, piece.code) ?? piece.code.trim().toUpperCase();
  if (piece.promoted) {
    code = PROMOTED_CAPTURE_TO_HAND_CODE[code] ?? code;
  }
  return code;
}

function decrementHand(hands: InternalHands, side: PlayerSide, pieceCode: string) {
  const current = hands[side][pieceCode] ?? 0;
  if (current <= 1) {
    delete hands[side][pieceCode];
    return;
  }
  hands[side][pieceCode] = current - 1;
}

function sameMove(left: NormalizedMove, right: NormalizedMove, rules: RuleSnapshot) {
  return (
    left.from === right.from &&
    left.to === right.to &&
    pieceCodesEquivalentForRules(rules, left.piece, right.piece) &&
    left.promote === right.promote &&
    left.drop === right.drop &&
    (left.notation ?? null) === (right.notation ?? null)
  );
}

function pieceCodesEquivalentForRules(rules: RuleSnapshot, left: string, right: string) {
  if (pieceCodesEquivalent(left, right)) return true;
  const leftGame = resolveGamePieceCodeFromRules(rules, left);
  const rightGame = resolveGamePieceCodeFromRules(rules, right);
  if (leftGame && rightGame && leftGame === rightGame) return true;
  const leftDef = rules.piecesByCode[left.trim().toUpperCase()];
  const rightDef = rules.piecesByCode[right.trim().toUpperCase()];
  if (leftDef && rightDef) return resolveGamePieceCode(leftDef) === resolveGamePieceCode(rightDef);
  return false;
}

function pieceCodesEquivalent(left: string, right: string) {
  const a = left.trim().toUpperCase();
  const b = right.trim().toUpperCase();
  if (a === b) return true;
  if (canonicalPieceCode(a) === canonicalPieceCode(b)) return true;
  return stripNamedPiecePrefix(a) === stripNamedPiecePrefix(b);
}

function stripNamedPiecePrefix(code: string) {
  if (!code.startsWith('PIECE_')) return code;
  if (/^PIECE_[0-9A-F]{8,}$/i.test(code)) return code;
  return code.slice('PIECE_'.length);
}

function toMovePayload(move: NormalizedMove): MovePayload {
  const payload: MovePayload = {
    from: move.from ?? undefined,
    to: move.to,
    piece: move.piece,
    promote: move.promote,
    drop: move.drop,
  };
  if (move.notation) payload.notation = move.notation;
  return payload;
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
