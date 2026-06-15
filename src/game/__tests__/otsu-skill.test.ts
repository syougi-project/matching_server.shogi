import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { mergeSkillDefinitions } from '@/game/skill-definitions';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('otsu piece followup skill', () => {
  test('grants one extra non-capture move after capturing an enemy piece', () => {
    const rules = createRules(['OTSU', 'FU', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '6f': 'black:OTSU',
        '5e': 'white:FU',
        '4d': 'white:FU',
      },
      handsState: { black: {}, white: {} },
      skillState: emptySkillState(),
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    const first = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '6f', to: '5e', piece: 'OTSU' },
    });

    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.nextGame.turn).toBe('black');
    expect(first.nextGame.moveCount).toBe(0);
    expect(first.nextGame.boardState['5e']).toBe('black:OTSU');
    expect(first.nextGame.handsState.black.FU ?? 0).toBe(1);
    expect(
      first.nextGame.skillState?.piece_statuses?.some(
        (entry) => String(entry.status_type) === 'otsu_followup',
      ),
    ).toBe(true);

    const illegalCapture = engine.applyMove({
      actorSide: 'black',
      rules,
      game: first.nextGame,
      move: { from: '5e', to: '4d', piece: 'OTSU' },
    });
    expect(illegalCapture.ok).toBe(false);

    const second = engine.applyMove({
      actorSide: 'black',
      rules,
      game: first.nextGame,
      move: { from: '5e', to: '4f', piece: 'OTSU' },
    });

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.nextGame.turn).toBe('white');
    expect(second.nextGame.moveCount).toBe(1);
    expect(second.nextGame.boardState['4f']).toBe('black:OTSU');
    expect(second.nextGame.boardState['4d']).toBe('white:FU');
  });
});

function emptySkillState(): GameSnapshot['skillState'] {
  return {
    board_hazards: [],
    board_arrow_tiles: [],
    movement_modifiers: [],
    piece_statuses: [],
    piece_defenses: [],
  };
}

function createRules(codes: string[]): RuleSnapshot {
  const piecesByCode: Record<string, PieceDefinition> = {};
  for (const code of ['FU', 'OU', ...codes]) {
    piecesByCode[code] = createPiece(code);
  }
  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode,
    skillDefinitions: mergeSkillDefinitions([]),
  };
}

function createPiece(code: string): PieceDefinition {
  const charByCode: Record<string, string> = {
    OTSU: '乙',
    FU: '歩',
    OU: '王',
  };
  const silverLike = [
    { dx: -1, dy: -1, maxStep: 1 },
    { dx: 0, dy: -1, maxStep: 1 },
    { dx: 1, dy: -1, maxStep: 1 },
    { dx: -1, dy: 1, maxStep: 1 },
    { dx: 1, dy: 1, maxStep: 1 },
  ];
  const vectors =
    code === 'OTSU'
      ? silverLike
      : code === 'OU'
        ? [
            { dx: -1, dy: -1, maxStep: 1 },
            { dx: 0, dy: -1, maxStep: 1 },
            { dx: 1, dy: -1, maxStep: 1 },
            { dx: -1, dy: 0, maxStep: 1 },
            { dx: 1, dy: 0, maxStep: 1 },
            { dx: -1, dy: 1, maxStep: 1 },
            { dx: 0, dy: 1, maxStep: 1 },
            { dx: 1, dy: 1, maxStep: 1 },
          ]
        : [{ dx: 0, dy: -1, maxStep: 1 }];
  return {
    pieceCode: code,
    canonicalCode: code,
    sfenCode: code,
    char: charByCode[code] ?? code,
    name: code,
    skill: '',
    moveVectors: vectors,
    moveRules: [],
    moveConstraints: null,
    promotable: false,
    skillDefinitionsV2: null,
  };
}
