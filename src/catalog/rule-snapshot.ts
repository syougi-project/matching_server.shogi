import { nowIso } from '@/lib/time';
import type { PieceCatalogProvider } from '@/catalog/contracts';
import {
  catalogItemsToPieceDefinitions,
  pieceDefinitionsToCatalogItems,
  type PvpCatalogNormalizer,
} from '@/catalog/pvp-catalog-normalize';
import { resolveGamePieceCode } from '@/catalog/game-piece-code';
import type { PieceDefinition, RuleSnapshot, SkillDefinition } from '@/types/domain';

export class RuleSnapshotBuilder {
  constructor(
    private readonly catalogProvider: PieceCatalogProvider,
    private readonly catalogNormalizer?: PvpCatalogNormalizer,
  ) {}

  async buildSnapshot(): Promise<RuleSnapshot> {
    let catalog = await this.catalogProvider.listPieces();
    if (this.catalogNormalizer) {
      const items = pieceDefinitionsToCatalogItems(catalog);
      const normalized = await this.catalogNormalizer(items);
      catalog = catalogItemsToPieceDefinitions(normalized, catalog);
    }

    const piecesByCode: Record<string, PieceDefinition> = {};
    const skillDefinitions: SkillDefinition[] = [];

    for (const piece of catalog) {
      registerPieceAliases(piecesByCode, piece);
      for (const definition of piece.skillDefinitionsV2?.definitions ?? []) {
        skillDefinitions.push({
          ...definition,
          pieceCodes: definition.pieceCodes?.map((code) => code.toUpperCase()),
        });
      }
    }

    return {
      version: 1,
      createdAt: nowIso(),
      piecesByCode,
      skillDefinitions,
    };
  }
}

function registerPieceAliases(
  piecesByCode: Record<string, PieceDefinition>,
  piece: PieceDefinition,
): void {
  const normalized = normalizePiece(piece);
  const primaryKey = normalized.pieceCode.toUpperCase();
  piecesByCode[primaryKey] = normalized;
  const gameCode = resolveGamePieceCode(normalized);
  const gameNormalized =
    gameCode === primaryKey
      ? normalized
      : {
          ...normalized,
          pieceCode: gameCode,
          canonicalCode: gameCode,
        };
  piecesByCode[gameCode] = gameNormalized;
  const ch = piece.char?.trim();
  if (ch) {
    piecesByCode[ch.toUpperCase()] = gameNormalized;
  }
}

function normalizePiece(piece: PieceDefinition): PieceDefinition {
  return {
    ...piece,
    pieceCode: piece.pieceCode.toUpperCase(),
    canonicalCode: piece.canonicalCode.toUpperCase(),
    moveVectors: piece.moveVectors.map((vector) => ({ ...vector })),
    moveRules: piece.moveRules?.map((rule) => ({ ...rule, params: { ...rule.params } })) ?? [],
    moveConstraints: piece.moveConstraints ? { ...piece.moveConstraints } : null,
    skillDefinitionsV2: piece.skillDefinitionsV2
      ? {
          definitions: piece.skillDefinitionsV2.definitions.map((definition) => ({
            ...definition,
            pieceCodes: definition.pieceCodes?.map((code) => code.toUpperCase()),
            pieceChars: definition.pieceChars?.map((char) => char),
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
  };
}
