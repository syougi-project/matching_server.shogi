import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import type { PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('BOOK copies opponent last moved piece range', () => {
  test('black book moves like recorded enemy knight', () => {
    const rules = createBookRules();
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '4e': 'black:BOOK',
        },
        handsState: { black: {}, white: {} },
        skillState: {
          ...emptySkillState(),
          last_enemy_moved_piece: {
            side: 'white',
            row: 6,
            col: 4,
            pieceCode: 'KE',
            char: '桂',
            promoted: false,
            copiedMoveVectors: [
              { dx: -1, dy: -2, maxStep: 1 },
              { dx: 1, dy: -2, maxStep: 1 },
            ],
          },
        },
        turn: 'black',
        moveCount: 1,
        version: 2,
      },
      move: { from: '4e', to: '5c', piece: 'BOOK', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['5c']).toBe('black:BOOK');
  });

  test('records enemy move marker when white moves', () => {
    const rules = createBookRules();
    const afterMove = engine.applyMove({
      actorSide: 'white',
      rules,
      game: {
        boardState: {
          '5i': 'black:OU',
          '5a': 'white:OU',
          '5e': 'white:FU',
        },
        handsState: { black: {}, white: {} },
        skillState: emptySkillState(),
        turn: 'white',
        moveCount: 0,
        version: 1,
      },
      move: { from: '5e', to: '5f', piece: 'FU', promote: false, drop: false },
    });
    expect(afterMove.ok).toBe(true);
    if (!afterMove.ok) return;
    const marker = afterMove.nextGame.skillState?.last_enemy_moved_piece as
      | Record<string, unknown>
      | undefined;
    expect(marker?.pieceCode).toBe('FU');
    expect(Array.isArray(marker?.copiedMoveVectors)).toBe(true);
  });
});

function emptySkillState() {
  return {
    board_hazards: [],
    board_arrow_tiles: [],
    movement_modifiers: [],
    piece_statuses: [],
    piece_defenses: [],
  };
}

function createBookRules(): RuleSnapshot {
  const kingLike: PieceDefinition['moveVectors'] = [
    { dx: -1, dy: -1, maxStep: 1 },
    { dx: 0, dy: -1, maxStep: 1 },
    { dx: 1, dy: -1, maxStep: 1 },
    { dx: -1, dy: 0, maxStep: 1 },
    { dx: 1, dy: 0, maxStep: 1 },
    { dx: -1, dy: 1, maxStep: 1 },
    { dx: 0, dy: 1, maxStep: 1 },
    { dx: 1, dy: 1, maxStep: 1 },
  ];
  const book: PieceDefinition = {
    pieceCode: 'BOOK',
    canonicalCode: 'BOOK',
    char: '書',
    name: '書',
    skill: '',
    moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
    canJump: true,
    isPromoted: false,
    promotable: false,
    moveConstraints: null,
    moveRules: [],
    skillDefinitionsV2: null,
  };
  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode: {
      OU: {
        pieceCode: 'OU',
        canonicalCode: 'OU',
        char: '王',
        name: '王',
        skill: '',
        moveVectors: kingLike,
        canJump: false,
        isPromoted: false,
        promotable: false,
        moveConstraints: null,
        moveRules: [],
        skillDefinitionsV2: null,
      },
      FU: {
        pieceCode: 'FU',
        canonicalCode: 'FU',
        char: '歩',
        name: '歩',
        skill: '',
        moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
        canJump: false,
        isPromoted: false,
        promotable: true,
        moveConstraints: null,
        moveRules: [],
        skillDefinitionsV2: null,
      },
      KE: {
        pieceCode: 'KE',
        canonicalCode: 'KE',
        char: '桂',
        name: '桂',
        skill: '',
        moveVectors: [
          { dx: -1, dy: -2, maxStep: 1 },
          { dx: 1, dy: -2, maxStep: 1 },
        ],
        canJump: true,
        isPromoted: false,
        promotable: true,
        moveConstraints: null,
        moveRules: [],
        skillDefinitionsV2: null,
      },
      BOOK: book,
    },
    skillDefinitions: [],
  };
}
