import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import {
  effectiveMovedSkillCode,
  hasAllySpringOnBoard,
  resolveEffectivePieceDefinition,
} from '@/game/spring-ryu-awakening';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('spring-ryu-awakening', () => {
  test('detects ally spring on board', () => {
    const rules = createDragonRules();
    const board = [
      { side: 'black' as const, code: 'SPRING', promoted: false },
      { side: 'white' as const, code: 'FU', promoted: false },
    ];
    expect(hasAllySpringOnBoard(board, rules, 'black')).toBe(true);
    expect(hasAllySpringOnBoard(board, rules, 'white')).toBe(false);
  });

  test('awakens small dragon movement to tatsu when ally spring exists', () => {
    const rules = createDragonRules();
    const board = [
      { side: 'black' as const, code: 'SPRING', promoted: false },
      { side: 'black' as const, code: 'RYU', promoted: false },
    ];
    const effective = resolveEffectivePieceDefinition(rules, board, board[1]!);
    expect(effective?.char).toBe('辰');
    expect(effective?.canonicalCode).toBe('TATSU');
  });

  test('uses tatsu skill code when awakened dragon moves', () => {
    const rules = createDragonRules();
    const board = [
      { side: 'black' as const, code: 'SPRING', promoted: false },
      { side: 'black' as const, code: 'RYU', promoted: false },
    ];
    const movedPiece = board[1]!;
    const pieceDef = rules.piecesByCode.RYU ?? null;
    expect(
      effectiveMovedSkillCode(rules, board, movedPiece, pieceDef, 'RYU'),
    ).toBe('TATSU');
  });

  test('allows awakened dragon to slide 3 squares orthogonally', () => {
    Math.random = () => 0;
    const rules = createDragonRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:SPRING',
        '4e': 'black:RYU',
      },
      handsState: { black: {}, white: {} },
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '4e', to: '4b', piece: 'RYU', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['4b']).toBe('black:RYU');
  });

  test('allows 4-square diagonal slide without spring ally', () => {
    const rules = createDragonRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:RYU',
      },
      handsState: { black: {}, white: {} },
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '1i', piece: 'RYU', promote: false, drop: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nextGame.boardState['1i']).toBe('black:RYU');
  });

  test('rejects 3-square orthogonal slide without spring ally', () => {
    const rules = createDragonRules();
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '4e': 'black:RYU',
      },
      handsState: { black: {}, white: {} },
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '4e', to: '4b', piece: 'RYU', promote: false, drop: false },
    });

    expect(result.ok).toBe(false);
  });
});

function createDragonRules(): RuleSnapshot {
  const ryu: PieceDefinition = {
    pieceCode: 'PIECE_3D76F6398BE6',
    canonicalCode: 'RYU',
    char: '竜',
    name: '小竜',
    skill: '',
    moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
    canJump: false,
    isPromoted: false,
    promotable: false,
    moveConstraints: null,
    moveRules: [],
    skillDefinitionsV2: null,
    sfenCode: 'F',
  };
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
  const tatsu: PieceDefinition = {
    pieceCode: 'PIECE_707ED60923E2',
    canonicalCode: 'TATSU',
    char: '辰',
    name: '辰神',
    skill: '',
    moveVectors: [{ dx: 0, dy: -1, maxStep: 8 }],
    canJump: false,
    isPromoted: false,
    promotable: false,
    moveConstraints: null,
    moveRules: [],
    skillDefinitionsV2: null,
    sfenCode: 'ZTS',
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

  return {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    piecesByCode: {
      OU: ou,
      RYU: ryu,
      PIECE_3D76F6398BE6: ryu,
      SPRING: spring,
      PIECE_3319765CD612: spring,
      TATSU: tatsu,
      PIECE_707ED60923E2: tatsu,
    },
    skillDefinitions: [],
  };
}
