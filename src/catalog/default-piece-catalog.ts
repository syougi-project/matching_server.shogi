import type { PieceCatalogProvider } from '@/catalog/contracts';
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
            conditions: [],
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
    canonicalCode: pieceCode,
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
