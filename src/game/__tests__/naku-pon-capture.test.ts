import { describe, expect, test } from 'bun:test';
import { applyNakuPonCaptures, isNakuPiece, isSameEnemyPieceTypeForNakuPon } from '@/game/naku-pon-capture';
import type { RuleSnapshot } from '@/types/domain';

function createRules(): RuleSnapshot {
  return {
    piecesByCode: {
      NAKU: {
        pieceCode: 'NAKU',
        canonicalCode: 'NAKU',
        char: '鳴',
        name: 'Naku',
        skill: '',
        moveVectors: [],
        canJump: false,
        isPromoted: false,
        promotable: false,
        moveConstraints: null,
        moveRules: [],
        skillDefinitionsV2: null,
        sfenCode: null,
      },
      FU: {
        pieceCode: 'FU',
        canonicalCode: 'PAWN',
        char: '歩',
        name: 'Pawn',
        skill: '',
        moveVectors: [],
        canJump: false,
        isPromoted: false,
        promotable: false,
        moveConstraints: null,
        moveRules: [],
        skillDefinitionsV2: null,
        sfenCode: 'P',
      },
    },
    skillDefinitions: [],
  };
}

describe('naku pon capture', () => {
  test('isNakuPiece detects shop naku by char', () => {
    const rules = createRules();
    expect(isNakuPiece({ side: 'black', code: 'NAKU', promoted: false }, rules)).toBe(true);
  });

  test('isSameEnemyPieceTypeForNakuPon matches by game code', () => {
    const rules = createRules();
    expect(
      isSameEnemyPieceTypeForNakuPon(
        rules,
        { side: 'white', code: 'FU', promoted: false },
        { side: 'white', code: 'FU', promoted: false },
      ),
    ).toBe(true);
  });

  test('sweeps up to two extra same-type enemies when at least two were on board', () => {
    const rules = createRules();
    const boardBeforeMove = new Map([
      ['6f', { side: 'white' as const, code: 'FU', promoted: false }],
      ['5f', { side: 'white' as const, code: 'FU', promoted: false }],
      ['4f', { side: 'white' as const, code: 'FU', promoted: false }],
      ['5g', { side: 'black' as const, code: 'NAKU', promoted: false }],
    ]);
    const board = new Map(boardBeforeMove);
    board.delete('5f');
    board.set('5f', { side: 'black', code: 'NAKU', promoted: false });

    const hands = { black: {} as Record<string, number>, white: {} as Record<string, number> };
    const swept = applyNakuPonCaptures({
      rules,
      boardBeforeMove,
      board,
      hands,
      actorSide: 'black',
      movedPiece: { side: 'black', code: 'NAKU', promoted: false },
      move: { from: '5g', to: '5f', piece: 'NAKU', promote: false, drop: false },
      capturedPiece: { side: 'white', code: 'FU', promoted: false },
      capturedToHandCode: () => 'FU',
      incrementHand: (side, pieceCode) => {
        hands[side][pieceCode] = (hands[side][pieceCode] ?? 0) + 1;
      },
    });

    expect(swept).toBe(true);
    expect(board.has('6f')).toBe(false);
    expect(board.has('4f')).toBe(false);
    expect(hands.black.FU).toBe(2);
  });
});
