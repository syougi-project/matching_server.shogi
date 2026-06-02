import type { PieceDefinition } from '@/types/domain';

export type PvpCatalogNormalizer = (
  items: PvpCatalogItem[],
) => PvpCatalogItem[] | Promise<PvpCatalogItem[]>;

export type PvpCatalogItem = {
  pieceCode: string;
  char: string;
  name: string;
  unlock: string;
  desc: string;
  skill: string;
  move: string;
  moveVectors: PieceDefinition['moveVectors'];
  isRepeatable: boolean;
  canJump?: boolean;
  moveConstraints?: Record<string, unknown> | null;
  moveRules?: PieceDefinition['moveRules'];
  skillDefinitionsV2?: PieceDefinition['skillDefinitionsV2'];
};

export function pieceDefinitionsToCatalogItems(
  pieces: PieceDefinition[],
): PvpCatalogItem[] {
  return pieces.map((piece) => ({
    pieceCode: piece.pieceCode,
    char: piece.char,
    name: piece.name,
    unlock: 'online',
    desc: piece.skill,
    skill: piece.skill,
    move: piece.name,
    moveVectors: piece.moveVectors,
    isRepeatable: false,
    canJump: piece.canJump,
    moveConstraints: piece.moveConstraints,
    moveRules: piece.moveRules,
    skillDefinitionsV2: piece.skillDefinitionsV2,
  }));
}

export function catalogItemsToPieceDefinitions(
  items: PvpCatalogItem[],
  originals: PieceDefinition[],
): PieceDefinition[] {
  const byCode = new Map(originals.map((piece) => [piece.pieceCode.toUpperCase(), piece]));
  return items.map((item) => {
    const original =
      byCode.get(item.pieceCode.toUpperCase()) ??
      originals.find((piece) => piece.char === item.char);
    return {
      ...(original ?? {
        pieceCode: item.pieceCode.toUpperCase(),
        canonicalCode: item.pieceCode.toUpperCase(),
        sfenCode: null,
        char: item.char,
        name: item.name,
        skill: item.skill,
        moveVectors: item.moveVectors,
        canJump: item.canJump ?? false,
        isPromoted: false,
        promotable: true,
        moveConstraints: item.moveConstraints ?? null,
        moveRules: item.moveRules ?? [],
        skillDefinitionsV2: item.skillDefinitionsV2 ?? null,
      }),
      pieceCode: item.pieceCode.toUpperCase(),
      canonicalCode: (original?.canonicalCode ?? item.pieceCode).toUpperCase(),
      char: item.char,
      name: item.name,
      skill: item.skill,
      moveVectors: item.moveVectors.map((vector) => ({ ...vector })),
      canJump: item.canJump ?? original?.canJump ?? false,
      moveConstraints: item.moveConstraints ?? original?.moveConstraints ?? null,
      moveRules: item.moveRules ?? original?.moveRules ?? [],
      skillDefinitionsV2: item.skillDefinitionsV2 ?? original?.skillDefinitionsV2 ?? null,
    };
  });
}
