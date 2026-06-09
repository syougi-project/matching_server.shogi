import { afterEach, describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import { mergeSkillDefinitions } from '@/game/skill-definitions';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();
const originalRandom = Math.random;

afterEach(() => {
  Math.random = originalRandom;
});

describe('stage19+ online skill parity', () => {
  test('armor cannot capture or be captured', () => {
    const rules = createRules(['ARMOR', 'FU', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:ARMOR',
        '4e': 'white:FU',
      },
      handsState: { black: {}, white: {} },
      skillState: emptySkillState(),
      turn: 'black',
      moveCount: 0,
      version: 1,
    };
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '4e', piece: 'ARMOR' },
    });
    expect(result.ok).toBe(false);
  });

  test('abyss stuns capturer for 3 turns', () => {
    const rules = createRules(['ABYSS', 'FU', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'white:ABYSS',
        '4f': 'black:KI',
      },
      handsState: { black: {}, white: {} },
      skillState: emptySkillState(),
      turn: 'black',
      moveCount: 0,
      version: 1,
    };
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '4f', to: '5e', piece: 'KI' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stun = result.nextGame.skillState?.piece_statuses?.find(
      (entry) => String(entry.status_type ?? entry.statusType) === 'abyss_stun',
    );
    expect(stun).toBeTruthy();
    expect(Number(stun?.remaining_turns ?? stun?.remainingTurns)).toBe(2);
  });

  test('satori stuns selected enemy via notation', () => {
    const rules = createRules(['SATORI', 'FU', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:SATORI',
        '4f': 'white:FU',
      },
      handsState: { black: {}, white: {} },
      skillState: emptySkillState(),
      turn: 'black',
      moveCount: 0,
      version: 1,
    };
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '5f', piece: 'SATORI', notation: 'satori_stun:5:5' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stun = result.nextGame.skillState?.piece_statuses?.find(
      (entry) => String(entry.status_type ?? entry.statusType) === 'stun',
    );
    expect(stun).toBeTruthy();
  });

  test('heart grants immunity to selected ally via notation', () => {
    const rules = createRules(['HEART', 'FU', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:HEART',
        '5f': 'black:FU',
      },
      handsState: { black: {}, white: {} },
      skillState: emptySkillState(),
      turn: 'black',
      moveCount: 0,
      version: 1,
    };
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '5d', piece: 'HEART', notation: 'heart_protect:5:4' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const defense = result.nextGame.skillState?.piece_defenses?.find(
      (entry) => String(entry.mode) === 'immunity',
    );
    expect(defense).toBeTruthy();
  });

  test('moon move range changes with turn count', () => {
    const rules = createRules(['MOON', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:MOON',
      },
      handsState: { black: {}, white: {} },
      skillState: emptySkillState(),
      turn: 'black',
      moveCount: 2,
      version: 1,
    };
    const result = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '3e', piece: 'MOON' },
    });
    expect(result.ok).toBe(true);
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
  for (const code of ['FU', 'GI', 'KI', 'OU', ...codes]) {
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
    ARMOR: '鎧',
    ABYSS: '淵',
    SATORI: '悟',
    HEART: '心',
    MOON: '月',
    FU: '歩',
    KI: '金',
    OU: '王',
  };
  const kingLike = [
    { dx: -1, dy: -1, maxStep: 1 },
    { dx: 0, dy: -1, maxStep: 1 },
    { dx: 1, dy: -1, maxStep: 1 },
    { dx: -1, dy: 0, maxStep: 1 },
    { dx: 1, dy: 0, maxStep: 1 },
    { dx: -1, dy: 1, maxStep: 1 },
    { dx: 0, dy: 1, maxStep: 1 },
    { dx: 1, dy: 1, maxStep: 1 },
  ];
  const slide = [
    { dx: 0, dy: -1, maxStep: 8 },
    { dx: 0, dy: 1, maxStep: 8 },
    { dx: -1, dy: 0, maxStep: 8 },
    { dx: 1, dy: 0, maxStep: 8 },
  ];
  const vectors =
    code === 'ABYSS'
      ? slide
      : code === 'MOON' || code === 'SATORI' || code === 'HEART' || code === 'KI'
        ? kingLike
        : [{ dx: 0, dy: -1, maxStep: 1 }];
  return {
    pieceCode: code,
    canonicalCode: code,
    sfenCode: code,
    char: charByCode[code] ?? code,
    name: code,
    moveVectors: vectors,
    moveRules: [],
    moveConstraints: null,
    promotable: false,
    skillDefinitionsV2: null,
  };
}
