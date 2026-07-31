import { describe, expect, test } from 'bun:test';
import { BasicRuleEngine } from '@/game/basic-rule-engine';
import type { GameSnapshot, PieceDefinition, RuleSnapshot } from '@/types/domain';

const engine = new BasicRuleEngine();

describe('peak skill online parity', () => {
  test('peak immobilizes enemy 10+ stroke special pieces across turns', () => {
    const rules = createRules(['PEAK', 'MIRROR', 'FU', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:PEAK',
        '5f': 'white:MIRROR',
        '4f': 'white:FU',
      },
      handsState: { black: {}, white: {} },
      skillState: emptySkillState(),
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    const moved = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '5d', piece: 'PEAK' },
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    const peakLocks = (moved.nextGame.skillState.piece_statuses ?? []).filter(
      (entry) => entry.status_type === 'peak_lock',
    );
    expect(peakLocks.length).toBeGreaterThan(0);
    expect(peakLocks.every((entry) => Number(entry.remaining_turns) > 0)).toBe(true);

    const mirrorMove = engine.applyMove({
      actorSide: 'white',
      rules,
      game: moved.nextGame,
      move: { from: '5f', to: '5g', piece: 'MIRROR' },
    });
    expect(mirrorMove.ok).toBe(false);

    const pawnMove = engine.applyMove({
      actorSide: 'white',
      rules,
      game: moved.nextGame,
      move: { from: '4f', to: '4g', piece: 'FU' },
    });
    expect(pawnMove.ok).toBe(true);
  });

  test('peak does not immobilize enemy special pieces under 10 strokes', () => {
    const rules = createRules(['PEAK', 'PHANTOM', 'OU']);
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': 'black:PEAK',
        '5f': 'white:PHANTOM',
      },
      handsState: { black: {}, white: {} },
      skillState: emptySkillState(),
      turn: 'black',
      moveCount: 0,
      version: 1,
    };

    const moved = engine.applyMove({
      actorSide: 'black',
      rules,
      game,
      move: { from: '5e', to: '5d', piece: 'PEAK' },
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    const phantomMove = engine.applyMove({
      actorSide: 'white',
      rules,
      game: moved.nextGame,
      move: { from: '5f', to: '4f', piece: 'PHANTOM' },
    });
    expect(phantomMove.ok).toBe(true);
  });

  test('opaque peak piece id still applies peak aura', () => {
    const opaque = 'PIECE_5A24E1332FF7';
    const rules = createRules(['MIRROR', 'OU']);
    rules.piecesByCode[opaque] = {
      pieceCode: opaque,
      canonicalCode: opaque,
      sfenCode: opaque,
      char: '峰',
      name: '峰',
      skill: '',
      moveVectors: [
        { dx: 0, dy: -1, maxStep: 1 },
        { dx: 0, dy: 1, maxStep: 1 },
        { dx: -1, dy: 0, maxStep: 1 },
        { dx: 1, dy: 0, maxStep: 1 },
      ],
      moveRules: [],
      moveConstraints: null,
      promotable: false,
      skillDefinitionsV2: null,
    };
    const game: GameSnapshot = {
      boardState: {
        '5i': 'black:OU',
        '5a': 'white:OU',
        '5e': `black:${opaque}`,
        '5f': 'white:MIRROR',
      },
      handsState: { black: {}, white: {} },
      skillState: emptySkillState(),
      turn: 'white',
      moveCount: 1,
      version: 1,
    };

    const mirrorMove = engine.applyMove({
      actorSide: 'white',
      rules,
      game,
      move: { from: '5f', to: '5g', piece: 'MIRROR' },
    });
    expect(mirrorMove.ok).toBe(false);
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
    skillDefinitions: [],
  };
}

function createPiece(code: string): PieceDefinition {
  const charByCode: Record<string, string> = {
    PEAK: '峰',
    MIRROR: '鏡',
    PHANTOM: '幻',
    FU: '歩',
    GI: '銀',
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
  return {
    pieceCode: code,
    canonicalCode: code,
    sfenCode: code,
    char: charByCode[code] ?? code,
    name: code,
    skill: '',
    moveVectors: code === 'FU' ? [{ dx: 0, dy: -1, maxStep: 1 }] : kingLike,
    moveRules: [],
    moveConstraints: null,
    promotable: false,
    skillDefinitionsV2: null,
  };
}
