import type { PlayerSide, RuleSnapshot, SkillDefinition } from '@/types/domain';

export type SkillContext = {
  board: Map<string, { side: PlayerSide; code: string; promoted: boolean }>;
  hands: Record<PlayerSide, Record<string, number>>;
  actorSide: PlayerSide;
  movedPiece: { side: PlayerSide; code: string; promoted: boolean };
  movedTo: string;
  capturedPiece: { side: PlayerSide; code: string; promoted: boolean } | null;
};

export type SkillApplyResult = {
  triggered: boolean;
  boardChanges: Array<{
    square: string;
    action: 'remove' | 'add';
    piece?: { side: PlayerSide; code: string; promoted?: boolean };
  }>;
  handChanges: Record<PlayerSide, Record<string, number>>;
};

/**
 * Applies skill effects to the game state.
 * Handles after_move and after_capture triggers with condition checks.
 */
export function applySkillEffects(
  rules: RuleSnapshot,
  context: SkillContext,
): SkillApplyResult {
  const matchingSkills = collectMatchingSkillDefinitions(rules, context.movedPiece);
  const boardChanges: SkillApplyResult['boardChanges'] = [];
  const handChanges: Record<PlayerSide, Record<string, number>> = {
    black: {},
    white: {},
  };

  for (const skillDef of matchingSkills) {
    const triggerType = skillDef.trigger.type;

    // after_move trigger: happens when a piece moves
    if (triggerType === 'after_move' && shouldTriggerSkill(skillDef, context)) {
      for (const effect of skillDef.effects) {
        if (effect.type === 'send_to_hand') {
          const result = executeAdjacentEnemySendToHand(context, effect.params?.maxTargets);
          if (result.success) {
            boardChanges.push(...result.boardChanges);
            mergeHandChanges(handChanges, result.handChanges);
          }
        }
      }
    }

    // after_capture trigger: happens when a piece captures
    if (triggerType === 'after_capture' && context.capturedPiece && shouldTriggerSkill(skillDef, context)) {
      for (const effect of skillDef.effects) {
        if (effect.type === 'multi_capture') {
          const result = executeAdjacentEnemyCapture(context, effect.params);
          if (result.success) {
            boardChanges.push(...result.boardChanges);
            mergeHandChanges(handChanges, result.handChanges);
          }
        }
      }
    }
  }

  const triggered = boardChanges.length > 0 || Object.values(handChanges).some((h) => Object.keys(h).length > 0);

  // Apply changes to actual state
  if (triggered) {
    for (const change of boardChanges) {
      if (change.action === 'remove') {
        context.board.delete(change.square);
      } else if (change.action === 'add' && change.piece) {
        context.board.set(change.square, { ...change.piece, promoted: change.piece.promoted ?? false });
      }
    }

    for (const side of ['black', 'white'] as const) {
      for (const [code, delta] of Object.entries(handChanges[side])) {
        if (delta !== 0) {
          context.hands[side][code] = (context.hands[side][code] ?? 0) + delta;
        }
      }
    }
  }

  return {
    triggered,
    boardChanges,
    handChanges,
  };
}

/**
 * Seeded random number generator for deterministic skill triggers.
 * Uses a simple LCG (Linear Congruential Generator) algorithm.
 */
let _rngSeed = 0x12345678;

export function setSkillRngSeed(seed: number): void {
  _rngSeed = seed >>> 0;
}

function getSkillRandomValue(): number {
  _rngSeed = ((_rngSeed * 1103515245 + 12345) >>> 0) & 0x7fffffff;
  return _rngSeed / 0x7fffffff;
}

/**
 * Determines whether a skill should trigger based on its conditions.
 * Handles: chance_roll (probability-based triggers)
 */
function shouldTriggerSkill(skillDef: SkillDefinition, context: SkillContext): boolean {
  if (!skillDef.conditions || skillDef.conditions.length === 0) {
    return true; // No conditions = always trigger
  }

  for (const condition of skillDef.conditions) {
    if (condition.type === 'chance_roll') {
      const procChance = (condition.params?.procChance as number) ?? 0.5;
      return getSkillRandomValue() < procChance;
    }
  }

  return true;
}

/**
 * Collects skill definitions that match the moved piece.
 */
function collectMatchingSkillDefinitions(
  rules: RuleSnapshot,
  movedPiece: { side: PlayerSide; code: string; promoted: boolean },
): SkillDefinition[] {
  return rules.skillDefinitions.filter((def) => {
    // Match by piece code
    if (def.pieceCodes?.some((code) => code.toUpperCase() === movedPiece.code.toUpperCase())) {
      return true;
    }

    // Match by piece character (kanji)
    const pieceDef = rules.piecesByCode[movedPiece.code];
    if (pieceDef && def.pieceChars?.includes(pieceDef.char)) {
      return true;
    }

    return false;
  });
}

/**
 * Executes send_to_hand effect: moves adjacent enemy pieces to their owner's hand.
 * Used by: 霧 (MIST) skill
 */
function executeAdjacentEnemySendToHand(
  context: SkillContext,
  maxTargetsRaw: unknown,
): {
  success: boolean;
  boardChanges: SkillApplyResult['boardChanges'];
  handChanges: Record<PlayerSide, Record<string, number>>;
} {
  const { row, col } = parseSquare(context.movedTo);
  const enemy = opposite(context.actorSide);
  const maxTargets = typeof maxTargetsRaw === 'number' && Number.isFinite(maxTargetsRaw) ? Math.max(1, Math.floor(maxTargetsRaw)) : 1;

  const boardChanges: SkillApplyResult['boardChanges'] = [];
  const handChanges: Record<PlayerSide, Record<string, number>> = { black: {}, white: {} };

  let removed = 0;
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const targetRow = row + dr;
      const targetCol = col + dc;
      if (!isInsideBoard(targetRow, targetCol)) continue;

      const targetSquare = formatSquare(targetRow, targetCol);
      const target = context.board.get(targetSquare);
      if (!target || target.side !== enemy || target.code === 'OU') continue;

      boardChanges.push({ square: targetSquare, action: 'remove' });
      handChanges[enemy][target.code] = (handChanges[enemy][target.code] ?? 0) + 1;

      removed += 1;
      if (removed >= maxTargets) break;
    }
    if (removed >= maxTargets) break;
  }

  return {
    success: removed > 0,
    boardChanges,
    handChanges,
  };
}

/**
 * Executes multi_capture effect: captures adjacent enemy pieces after the initial capture.
 * Used by: 刀 (KATANA) skill
 */
function executeAdjacentEnemyCapture(
  context: SkillContext,
  params?: Record<string, unknown>,
): {
  success: boolean;
  boardChanges: SkillApplyResult['boardChanges'];
  handChanges: Record<PlayerSide, Record<string, number>>;
} {
  const { row, col } = parseSquare(context.movedTo);
  const enemy = opposite(context.actorSide);

  const boardChanges: SkillApplyResult['boardChanges'] = [];
  const handChanges: Record<PlayerSide, Record<string, number>> = { black: {}, white: {} };

  let captured = false;

  // Default katana: left and right adjacent pieces
  const offsets = (params?.offsets as Array<{ dr: number; dc: number }>) ?? [
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  for (const offset of offsets) {
    const targetRow = row + offset.dr;
    const targetCol = col + offset.dc;
    if (!isInsideBoard(targetRow, targetCol)) continue;

    const targetSquare = formatSquare(targetRow, targetCol);
    const target = context.board.get(targetSquare);
    if (!target || target.side !== enemy || target.code === 'OU') continue;

    boardChanges.push({ square: targetSquare, action: 'remove' });
    handChanges[context.actorSide][target.code] = (handChanges[context.actorSide][target.code] ?? 0) + 1;

    captured = true;
  }

  return {
    success: captured,
    boardChanges,
    handChanges,
  };
}

/**
 * Helper functions
 */

function opposite(side: PlayerSide): PlayerSide {
  return side === 'black' ? 'white' : 'black';
}

function parseSquare(square: string): { row: number; col: number } {
  const col = parseInt(square.charAt(0), 10) - 1;
  const row = square.toLowerCase().charCodeAt(1) - 'a'.charCodeAt(0);
  return { row, col };
}

function formatSquare(row: number, col: number): string {
  const colStr = (col + 1).toString();
  const rowStr = String.fromCharCode('a'.charCodeAt(0) + row);
  return colStr + rowStr;
}

function isInsideBoard(row: number, col: number): boolean {
  return row >= 0 && row <= 8 && col >= 0 && col <= 8;
}

function mergeHandChanges(
  target: Record<PlayerSide, Record<string, number>>,
  source: Record<PlayerSide, Record<string, number>>,
): void {
  for (const side of ['black', 'white'] as const) {
    for (const [code, delta] of Object.entries(source[side])) {
      target[side][code] = (target[side][code] ?? 0) + delta;
    }
  }
}
