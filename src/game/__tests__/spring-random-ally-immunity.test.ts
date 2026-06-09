import { afterEach, describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();
const originalRandom = Math.random;

afterEach(() => {
  Math.random = originalRandom;
});

describe('spring random ally immunity', () => {
  test('grants immunity to a random ally when spring moves', () => {
    Math.random = () => 0;
    const rules = createSpringRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:SPRING',
        '4e': 'black:FU',
      },
      handsState: { black: {}, white: {} },
      skillState: { piece_defenses: [] },
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '5f', piece: 'SPRING', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const defenses = result.nextGame.skillState?.piece_defenses ?? [];
    expect(defenses).toHaveLength(1);
    expect(defenses[0]).toMatchObject({
      row: 4,
      col: 5,
      side: 'black',
      mode: 'immunity',
      remaining_turns: 4,
    });
  });

  test('blocks enemy capture against spring-enhanced ally', () => {
    Math.random = () => 0;
    const rules = createSpringRules();
    let game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:SPRING',
        '4e': 'black:FU',
        '3e': 'white:GI',
      },
      handsState: { black: {}, white: {} },
      skillState: { piece_defenses: [] },
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    const springMove = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '5f', piece: 'SPRING', promote: false, drop: false },
    });
    expect(springMove.ok).toBe(true);
    if (!springMove.ok) return;
    game = springMove.nextGame;

    const captureAttempt = engine.applyMove({
      actorSide: 'white',
      rules,
      game,
      move: { from: '3e', to: '4e', piece: 'GI', promote: false, drop: false },
    });

    expect(captureAttempt.ok).toBe(false);
  });
});

function createSpringRules(): RuleSnapshot {
  const spring: PieceDefinition = {
    pieceCode: 'PIECE_3319765CD612',
    canonicalCode: 'SPRING',
    char: '泉',
    name: '泉',
    skill: '',
    moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
    canJump: false,
    isPromoted: false,
    promotable: false,
    moveConstraints: null,
    moveRules: [],
    skillDefinitionsV2: null,
    sfenCode: 'ZQN',
  };
  const ou: PieceDefinition = {
    pieceCode: 'OU',
    canonicalCode: 'OU',
    char: '王',
    name: 'King',
    skill: '',
    moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
    canJump: false,
    isPromoted: false,
    promotable: false,
    moveConstraints: null,
    moveRules: [],
    skillDefinitionsV2: null,
    sfenCode: 'K',
  };
  const fu: PieceDefinition = {
    pieceCode: 'FU',
    canonicalCode: 'FU',
    char: '歩',
    name: 'Pawn',
    skill: '',
    moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
    canJump: false,
    isPromoted: false,
    promotable: true,
    moveConstraints: null,
    moveRules: [],
    skillDefinitionsV2: null,
    sfenCode: 'P',
  };
  const gi: PieceDefinition = {
    pieceCode: 'GI',
    canonicalCode: 'GI',
    char: '銀',
    name: 'Silver',
    skill: '',
    moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
    canJump: false,
    isPromoted: false,
    promotable: true,
    moveConstraints: null,
    moveRules: [],
    skillDefinitionsV2: null,
    sfenCode: 'S',
  };

  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode: {
      OU: ou,
      SPRING: spring,
      PIECE_3319765CD612: spring,
      FU: fu,
      GI: gi,
    },
    skillDefinitions: [],
  };
}
