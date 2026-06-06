import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('online battle check rules', () => {
  test('allows a move that leaves the king in check', () => {
    const rules = createStandardRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5b': 'white:HI',
        '9i': 'black:FU',
      },
      handsState: { black: {}, white: {} },
      skillState: null,
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '9i', to: '9h', piece: 'FU' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['9h']).toBe('black:FU');
    expect(result.nextGame.boardState['9i']).toBeUndefined();
    expect(result.finished).toBeUndefined();
  });
});

function createStandardRules(): RuleSnapshot {
  const piecesByCode: Record<string, PieceDefinition> = {};
  for (const code of ['FU', 'HI', 'OU']) {
    piecesByCode[code] = {
      pieceCode: code,
      canonicalCode: code,
      char: code,
      name: code,
      skill: '',
      moveVectors:
        code === 'FU'
          ? [{ dx: 0, dy: -1, maxStep: 1 }]
          : code === 'HI'
            ? [
                { dx: -1, dy: 0, maxStep: 8 },
                { dx: 1, dy: 0, maxStep: 8 },
                { dx: 0, dy: -1, maxStep: 8 },
                { dx: 0, dy: 1, maxStep: 8 },
              ]
            : [
                { dx: -1, dy: -1, maxStep: 1 },
                { dx: 0, dy: -1, maxStep: 1 },
                { dx: 1, dy: -1, maxStep: 1 },
                { dx: -1, dy: 0, maxStep: 1 },
                { dx: 1, dy: 0, maxStep: 1 },
                { dx: -1, dy: 1, maxStep: 1 },
                { dx: 0, dy: 1, maxStep: 1 },
                { dx: 1, dy: 1, maxStep: 1 },
              ],
      canJump: false,
      isPromoted: false,
      promotable: false,
      moveConstraints: null,
      moveRules: [],
      skillDefinitionsV2: null,
    };
  }
  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode,
    skillDefinitions: [],
  };
}
