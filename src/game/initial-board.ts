import type { BattleSetupSnapshot, GameSnapshot, PlayerSide, RuleSnapshot } from '@/types/domain';

const RANKS = 'abcdefghi';

export function createInitialGameFromBattleSetups(input: {
  rules: RuleSnapshot;
  blackSetup: BattleSetupSnapshot;
  whiteSetup: BattleSetupSnapshot;
}): GameSnapshot {
  const allowedCodes = new Set(Object.keys(input.rules.piecesByCode));
  const boardState: Record<string, string> = {};
  const handsState: GameSnapshot['handsState'] = {
    black: {},
    white: {},
  };

  for (const placement of input.blackSetup.boardLayout) {
    const pieceCode = placement.pieceCode.toUpperCase();
    if (!allowedCodes.has(pieceCode)) continue;
    boardState[toSquare(placement.row, placement.col)] = `black:${pieceCode}`;
  }
  for (const placement of input.whiteSetup.boardLayout) {
    const pieceCode = placement.pieceCode.toUpperCase();
    if (!allowedCodes.has(pieceCode)) continue;
    const mirrored = mirrorCell(placement.row, placement.col);
    boardState[toSquare(mirrored.row, mirrored.col)] = `white:${pieceCode}`;
  }

  for (const hand of input.blackSetup.handsLayout) {
    const pieceCode = hand.pieceCode.toUpperCase();
    if (!allowedCodes.has(pieceCode)) continue;
    handsState.black[pieceCode] = (handsState.black[pieceCode] ?? 0) + hand.count;
  }
  for (const hand of input.whiteSetup.handsLayout) {
    const pieceCode = hand.pieceCode.toUpperCase();
    if (!allowedCodes.has(pieceCode)) continue;
    handsState.white[pieceCode] = (handsState.white[pieceCode] ?? 0) + hand.count;
  }

  return {
    boardState,
    handsState,
    turn: 'black',
    moveCount: 0,
    version: 1,
  };
}

function toSquare(row: number, col: number) {
  return `${9 - col}${RANKS[row]}`;
}

function mirrorCell(row: number, col: number) {
  return {
    row: 8 - row,
    col: 8 - col,
  };
}
