import { nowIso } from '@/lib/time';
import type { PieceCatalogProvider } from '@/catalog/contracts';
import type { PieceDefinition, RuleSnapshot, SkillDefinition } from '@/types/domain';

export class RuleSnapshotBuilder {
  constructor(private readonly catalogProvider: PieceCatalogProvider) {}

  async buildSnapshot(): Promise<RuleSnapshot> {
    const catalog = await this.catalogProvider.listPieces();
    const piecesByCode: Record<string, PieceDefinition> = {};
    const skillDefinitions: SkillDefinition[] = [];

    for (const piece of catalog) {
      piecesByCode[piece.pieceCode.toUpperCase()] = normalizePiece(piece);
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
