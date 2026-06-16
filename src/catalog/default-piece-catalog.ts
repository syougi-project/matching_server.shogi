import type { PieceCatalogProvider } from '@/catalog/contracts';
import { AORI_MOVE_VECTORS, KOU_MOVE_VECTORS } from '@/game/gacha-piece-move-vectors';
import {
  RYU_DRAGON_MOVE_VECTORS,
  SPRING_MOVE_VECTORS,
  TATSU_DRAGON_AWAKENED_MOVE_VECTORS,
} from '@/game/spring-ryu-awakening';
import { WAVE_MOVE_VECTORS, YAMA_MOVE_VECTORS } from '@/game/shop-piece-move-vectors';
import type { PieceDefinition } from '@/types/domain';

const DEFAULT_PIECES: PieceDefinition[] = [
  createPiece('FU', '歩', 'Pawn', [{ dx: 0, dy: -1, maxStep: 1 }], {
    promotable: true,
  }),
  createPiece('KY', '香', 'Lance', [{ dx: 0, dy: -1, maxStep: 8 }], {
    promotable: true,
  }),
  createPiece(
    'KE',
    '桂',
    'Knight',
    [
      { dx: -1, dy: -2, maxStep: 1 },
      { dx: 1, dy: -2, maxStep: 1 },
    ],
    { promotable: true, canJump: true },
  ),
  createPiece(
    'GI',
    '銀',
    'Silver',
    [
      { dx: -1, dy: -1, maxStep: 1 },
      { dx: 0, dy: -1, maxStep: 1 },
      { dx: 1, dy: -1, maxStep: 1 },
      { dx: -1, dy: 1, maxStep: 1 },
      { dx: 1, dy: 1, maxStep: 1 },
    ],
    { promotable: true },
  ),
  createPiece(
    'KI',
    '金',
    'Gold',
    [
      { dx: -1, dy: -1, maxStep: 1 },
      { dx: 0, dy: -1, maxStep: 1 },
      { dx: 1, dy: -1, maxStep: 1 },
      { dx: -1, dy: 0, maxStep: 1 },
      { dx: 1, dy: 0, maxStep: 1 },
      { dx: 0, dy: 1, maxStep: 1 },
    ],
  ),
  createPiece(
    'KA',
    '角',
    'Bishop',
    [
      { dx: -1, dy: -1, maxStep: 8 },
      { dx: 1, dy: -1, maxStep: 8 },
      { dx: -1, dy: 1, maxStep: 8 },
      { dx: 1, dy: 1, maxStep: 8 },
    ],
    { promotable: true },
  ),
  createPiece(
    'HI',
    '飛',
    'Rook',
    [
      { dx: 0, dy: -1, maxStep: 8 },
      { dx: 0, dy: 1, maxStep: 8 },
      { dx: -1, dy: 0, maxStep: 8 },
      { dx: 1, dy: 0, maxStep: 8 },
    ],
    { promotable: true },
  ),
  createPiece(
    'OU',
    '王',
    'King',
    [
      { dx: -1, dy: -1, maxStep: 1 },
      { dx: 0, dy: -1, maxStep: 1 },
      { dx: 1, dy: -1, maxStep: 1 },
      { dx: -1, dy: 0, maxStep: 1 },
      { dx: 1, dy: 0, maxStep: 1 },
      { dx: -1, dy: 1, maxStep: 1 },
      { dx: 0, dy: 1, maxStep: 1 },
      { dx: 1, dy: 1, maxStep: 1 },
    ],
    { promotable: false },
  ),
  createPiece(
    'MIST',
    '霧',
    'Mist',
    [
      { dx: -1, dy: -1, maxStep: 1 },
      { dx: 0, dy: -1, maxStep: 1 },
      { dx: 1, dy: -1, maxStep: 1 },
      { dx: -1, dy: 0, maxStep: 1 },
      { dx: 1, dy: 0, maxStep: 1 },
      { dx: -1, dy: 1, maxStep: 1 },
      { dx: 0, dy: 1, maxStep: 1 },
      { dx: 1, dy: 1, maxStep: 1 },
    ],
    {
      promotable: false,
      skill: 'adjacent_enemy_send_to_hand',
      skillDefinitionsV2: {
        definitions: [
          {
            skillId: 39,
            pieceCodes: ['MIST'],
            pieceChars: ['霧'],
            trigger: { type: 'after_move' },
            conditions: [{ type: 'chance_roll', params: { procChance: 0.3 } }],
            effects: [
              {
                type: 'send_to_hand',
                target: { group: 'adjacent', selector: 'adjacent_enemy' },
                params: { handOwner: 'target_owner', maxTargets: 1 },
              },
            ],
          },
        ],
      },
    },
  ),
  createPiece(
    'KATANA',
    '刀',
    'Katana',
    [{ dx: 0, dy: -1, maxStep: 1 }],
    {
      promotable: false,
      skill: 'adjacent_after_capture',
      skillDefinitionsV2: {
        definitions: [
          {
            skillId: 52,
            pieceCodes: ['KATANA'],
            pieceChars: ['刀'],
            trigger: { group: 'event_capture', type: 'after_capture' },
            conditions: [],
            effects: [
              {
                type: 'multi_capture',
                target: { group: 'adjacent', selector: 'adjacent_enemy' },
                params: { captureMode: 'adjacent_after_capture' },
              },
            ],
          },
        ],
      },
    },
  ),
  createPiece('SUI', '水', 'Water', kingLikeVectors(), {
    sfenCode: 'WATER',
    canonicalCode: 'SUI',
    promotable: false,
    skill: 'push_adjacent_enemy_one_step',
  }),
  createPiece('NAM', '波', 'Wave', WAVE_MOVE_VECTORS, {
    sfenCode: 'WAVE',
    canonicalCode: 'NAM',
    promotable: false,
    skill: 'push_adjacent_enemy_one_step',
  }),
  createPiece('RYU', '竜', 'Small Dragon', RYU_DRAGON_MOVE_VECTORS, {
    sfenCode: 'F',
    canonicalCode: 'RYU',
    promotable: false,
    skill: 'spring_awaken_to_tatsu',
  }),
  createPiece('SPRING', '泉', 'Spring', SPRING_MOVE_VECTORS, {
    sfenCode: 'ZQN',
    canonicalCode: 'SPRING',
    promotable: false,
    skill: 'spring_random_ally_immunity',
  }),
  createPiece('TATSU', '辰', 'Tatsu', TATSU_DRAGON_AWAKENED_MOVE_VECTORS, {
    sfenCode: 'ZTS',
    canonicalCode: 'TATSU',
    promotable: false,
    skill: 'tatsu_adjacent_vanish',
  }),
  createPiece('IRON', '鉄', 'Iron', kingLikeVectors(), {
    promotable: false,
    skill: 'push_adjacent_enemy_one_step',
  }),
  createPiece('RAINBOW', '虹', 'Rainbow', kingLikeVectors(), {
    promotable: false,
    skill: 'adjacent_enemy_orthogonal_step_only',
  }),
  createPiece('MAI', '舞', 'Mai', goldLikeVectors(), {
    promotable: false,
    skill: 'adjacent_enemy_diagonal_forward_step_only',
  }),
  createPiece('NAKU', '鳴', 'Naku', [
    { dx: -1, dy: -1, maxStep: 1 },
    { dx: 0, dy: -1, maxStep: 1 },
    { dx: 1, dy: -1, maxStep: 1 },
    { dx: -1, dy: 1, maxStep: 1 },
    { dx: 1, dy: 1, maxStep: 1 },
  ], {
    promotable: false,
    skill: 'naku_pon_capture',
  }),
  createPiece('TANE', '種', 'Tane', [
    { dx: -1, dy: -1, maxStep: 1 },
    { dx: 0, dy: -1, maxStep: 1 },
    { dx: 1, dy: -1, maxStep: 1 },
    { dx: -1, dy: 1, maxStep: 1 },
    { dx: 1, dy: 1, maxStep: 1 },
  ], {
    promotable: false,
    skill: 'summon_leaf_adjacent',
  }),
  createPiece('HAA', '葉', 'Leaf', kingLikeVectors(), {
    promotable: false,
    skill: 'summon_leaf_adjacent',
  }),
  createPiece('POISON', '毒', 'Poison', kingLikeVectors(), {
    promotable: false,
    skill: 'poison_trail',
  }),
  createPiece('GACHA_KOU', '膠', 'Glue', KOU_MOVE_VECTORS, {
    sfenCode: 'GACHA_KO',
    canonicalCode: 'GACHA_KOU',
    promotable: false,
    skill: 'follow_adjacent_ally_move',
  }),
  createPiece('GACHA_AORI', '煽', 'Aori', AORI_MOVE_VECTORS, {
    sfenCode: 'GACHA_AORI',
    canonicalCode: 'GACHA_AORI',
    promotable: false,
  }),
  createPiece('YAMA', '山', 'Yama', YAMA_MOVE_VECTORS, {
    promotable: false,
  }),
];

export class InMemoryPieceCatalogProvider implements PieceCatalogProvider {
  async listPieces() {
    return DEFAULT_PIECES.map((piece) => ({
      ...piece,
      moveVectors: piece.moveVectors.map((vector) => ({ ...vector })),
      moveRules: piece.moveRules?.map((rule) => ({ ...rule, params: { ...rule.params } })),
      moveConstraints: piece.moveConstraints ? { ...piece.moveConstraints } : null,
      skillDefinitionsV2: piece.skillDefinitionsV2
        ? {
            definitions: piece.skillDefinitionsV2.definitions.map((definition) => ({
              ...definition,
              trigger: { ...definition.trigger },
              conditions: definition.conditions.map((condition) => ({
                ...condition,
                params: { ...(condition.params ?? {}) },
              })),
              effects: definition.effects.map((effect) => ({
                ...effect,
                target: effect.target ? { ...effect.target } : undefined,
                params: { ...(effect.params ?? {}) },
              })),
            })),
          }
        : null,
    }));
  }
}

function createPiece(
  pieceCode: string,
  char: string,
  name: string,
  moveVectors: PieceDefinition['moveVectors'],
  overrides?: Partial<PieceDefinition>,
): PieceDefinition {
  return {
    pieceCode,
    canonicalCode: overrides?.canonicalCode ?? pieceCode,
    char,
    name,
    skill: overrides?.skill ?? '',
    moveVectors,
    canJump: overrides?.canJump ?? false,
    isPromoted: overrides?.isPromoted ?? false,
    promotable: overrides?.promotable ?? false,
    moveConstraints: overrides?.moveConstraints ?? null,
    moveRules: overrides?.moveRules ?? [],
    skillDefinitionsV2: overrides?.skillDefinitionsV2 ?? null,
    sfenCode: overrides?.sfenCode ?? null,
  };
}

function goldLikeVectors(): PieceDefinition['moveVectors'] {
  return [
    { dx: -1, dy: -1, maxStep: 1 },
    { dx: 0, dy: -1, maxStep: 1 },
    { dx: 1, dy: -1, maxStep: 1 },
    { dx: -1, dy: 0, maxStep: 1 },
    { dx: 1, dy: 0, maxStep: 1 },
    { dx: 0, dy: 1, maxStep: 1 },
  ];
}

function kingLikeVectors(): PieceDefinition['moveVectors'] {
  return [
    { dx: -1, dy: -1, maxStep: 1 },
    { dx: 0, dy: -1, maxStep: 1 },
    { dx: 1, dy: -1, maxStep: 1 },
    { dx: -1, dy: 0, maxStep: 1 },
    { dx: 1, dy: 0, maxStep: 1 },
    { dx: -1, dy: 1, maxStep: 1 },
    { dx: 0, dy: 1, maxStep: 1 },
    { dx: 1, dy: 1, maxStep: 1 },
  ];
}
