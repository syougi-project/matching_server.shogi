import type { BattleSetupSnapshot, GameSnapshot, PlayerSide, RuleSnapshot } from '@/types/domain';

const RANKS = 'abcdefghi';

export function createInitialGameFromBattleSetups(input: {
  rules: RuleSnapshot;
  blackSetup: BattleSetupSnapshot;
  whiteSetup: BattleSetupSnapshot;
}): GameSnapshot {
  const boardState: Record<string, string> = {};
  const handsState: GameSnapshot['handsState'] = {
    black: {},
    white: {},
  };

  for (const placement of input.blackSetup.boardLayout) {
    const pieceCode = resolvePlacementPieceCode(placement.pieceCode, input.rules);
    if (!pieceCode) continue;
    boardState[toSquare(placement.row, placement.col)] = `black:${pieceCode}`;
  }
  for (const placement of input.whiteSetup.boardLayout) {
    const pieceCode = resolvePlacementPieceCode(placement.pieceCode, input.rules);
    if (!pieceCode) continue;
    const mirrored = mirrorCell(placement.row, placement.col);
    boardState[toSquare(mirrored.row, mirrored.col)] = `white:${pieceCode}`;
  }

  for (const hand of input.blackSetup.handsLayout) {
    const pieceCode = resolvePlacementPieceCode(hand.pieceCode, input.rules);
    if (!pieceCode) continue;
    handsState.black[pieceCode] = (handsState.black[pieceCode] ?? 0) + hand.count;
  }
  for (const hand of input.whiteSetup.handsLayout) {
    const pieceCode = resolvePlacementPieceCode(hand.pieceCode, input.rules);
    if (!pieceCode) continue;
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

/** 旧アプリが保存した battle-setup コード → BFF マスタへ寄せる */
const PLACEMENT_PIECE_CODE_ALIASES: Readonly<Record<string, string>> = {
  PIECE_GACHA_SHITSU: 'PIECE_GACHA_MURO',
  PIECE_GACHA_KOU: 'PIECE_GACHA_KO',
  PIECE_GACHA_TOU2: 'PIECE_GACHA_TO',
};

function placementCodeCandidates(rawCode: string): string[] {
  const upper = rawCode.trim().toUpperCase();
  if (!upper) return [];
  const alias = PLACEMENT_PIECE_CODE_ALIASES[upper];
  const candidates = [upper];
  if (alias) candidates.push(alias);
  if (alias === 'PIECE_GACHA_KO') candidates.push('GACHA_KOU');
  if (alias === 'PIECE_GACHA_MURO') candidates.push('GACHA_SHITSU');
  if (alias === 'PIECE_GACHA_TO') candidates.push('GACHA_TOU2');
  return [...new Set(candidates)];
}

function resolvePlacementPieceCode(
  rawCode: string,
  rules: RuleSnapshot,
): string | null {
  for (const upper of placementCodeCandidates(rawCode)) {
    const direct = rules.piecesByCode[upper];
    if (direct) return direct.pieceCode.toUpperCase();
  }

  for (const upper of placementCodeCandidates(rawCode)) {
    for (const piece of Object.values(rules.piecesByCode)) {
      if (piece.sfenCode?.trim().toUpperCase() === upper) {
        return piece.pieceCode.toUpperCase();
      }
      if (piece.canonicalCode?.trim().toUpperCase() === upper) {
        return piece.pieceCode.toUpperCase();
      }
      if (piece.char.trim().toUpperCase() === upper) {
        return piece.pieceCode.toUpperCase();
      }
    }
  }

  return null;
}
