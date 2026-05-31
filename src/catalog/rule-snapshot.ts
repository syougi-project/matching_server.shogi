import { nowIso } from '@/lib/time';
import type { PieceCatalogProvider } from '@/catalog/contracts';
import {
  catalogItemsToPieceDefinitions,
  pieceDefinitionsToCatalogItems,
  type PvpCatalogNormalizer,
} from '@/catalog/pvp-catalog-normalize';
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

function resolveGamePieceCode(piece: PieceDefinition): string {
  const canonical = piece.canonicalCode.trim().toUpperCase();
  const byCanonical = STANDARD_CANONICAL_TO_GAME_CODE[canonical];
  if (byCanonical) return byCanonical;

  const sfen = piece.sfenCode?.trim().toUpperCase();
  if (sfen) {
    const bySfen = STANDARD_SFEN_TO_GAME_CODE[sfen.replace(/^\+/, '')];
    if (bySfen) return piece.isPromoted ? (PROMOTED_STANDARD_CODE[bySfen] ?? bySfen) : bySfen;
  }

  const byChar = STANDARD_CHAR_TO_GAME_CODE[piece.char.trim()];
  if (byChar) return piece.isPromoted ? (PROMOTED_STANDARD_CODE[byChar] ?? byChar) : byChar;

  return piece.pieceCode.trim().toUpperCase();
}

const STANDARD_CANONICAL_TO_GAME_CODE: Record<string, string> = {
  PAWN: 'FU',
  LANCE: 'KY',
  KNIGHT: 'KE',
  SILVER: 'GI',
  GOLD: 'KI',
  BISHOP: 'KA',
  ROOK: 'HI',
  KING: 'OU',
};

const STANDARD_SFEN_TO_GAME_CODE: Record<string, string> = {
  P: 'FU',
  L: 'KY',
  N: 'KE',
  S: 'GI',
  G: 'KI',
  B: 'KA',
  R: 'HI',
  K: 'OU',
};

const STANDARD_CHAR_TO_GAME_CODE: Record<string, string> = {
  歩: 'FU',
  香: 'KY',
  桂: 'KE',
  銀: 'GI',
  金: 'KI',
  角: 'KA',
  飛: 'HI',
  王: 'OU',
  玉: 'OU',
  と: 'TO',
  成香: 'NY',
  成桂: 'NK',
  成銀: 'NG',
  馬: 'UM',
  龍: 'RY',
  竜: 'RY',
};

const PROMOTED_STANDARD_CODE: Record<string, string> = {
  FU: 'TO',
  KY: 'NY',
  KE: 'NK',
  GI: 'NG',
  KA: 'UM',
  HI: 'RY',
};

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
