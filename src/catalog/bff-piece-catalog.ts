import type { PieceCatalogProvider } from '@/catalog/contracts';
import { fetchJson } from '@/lib/fetch-json';
import type { PieceDefinition } from '@/types/domain';

type BffPieceCatalogResponse = {
  items: Array<{
    pieceCode?: string | null;
    canonicalCode?: string | null;
    sfenCode?: string | null;
    char: string;
    name: string;
    skill?: string;
    moveVectors: PieceDefinition['moveVectors'];
    canJump?: boolean;
    isPromoted?: boolean;
    moveConstraints?: Record<string, unknown> | null;
    moveRules?: PieceDefinition['moveRules'];
    skillDefinitionsV2?: unknown;
    skill_definitions_v2?: unknown;
  }>;
};

export class BffPieceCatalogProvider implements PieceCatalogProvider {
  constructor(private readonly baseUrl: string) {}

  async listPieces(): Promise<PieceDefinition[]> {
    const response = await fetchJson<BffPieceCatalogResponse>(
      `${this.baseUrl}/api/v1/pieces/catalog`,
    );
    return response.items
      .filter((item) => typeof item.pieceCode === 'string' && item.pieceCode.trim().length > 0)
      .map((item) => ({
        pieceCode: item.pieceCode!.trim().toUpperCase(),
        canonicalCode: (item.canonicalCode ?? item.pieceCode ?? '').trim().toUpperCase(),
        sfenCode: item.sfenCode ?? null,
        char: item.char,
        name: item.name,
        skill: item.skill ?? '',
        moveVectors: item.moveVectors.map((vector) => ({ ...vector })),
        canJump: item.canJump ?? false,
        isPromoted: item.isPromoted ?? false,
        promotable: !Boolean(item.isPromoted),
        moveConstraints: item.moveConstraints ?? null,
        moveRules: item.moveRules?.map((rule) => ({ ...rule, params: { ...rule.params } })) ?? [],
        skillDefinitionsV2: normalizeSkillDefinitions(
          item.skillDefinitionsV2 ?? item.skill_definitions_v2,
        ),
      }));
  }
}

function normalizeSkillDefinitions(raw: unknown): PieceDefinition['skillDefinitionsV2'] {
  if (!raw || typeof raw !== 'object') return null;
  const definitions = (raw as { definitions?: unknown }).definitions;
  if (!Array.isArray(definitions)) return null;
  return {
    definitions: definitions
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
      .map((entry) => ({
        skillId: Number(entry.skillId ?? 0),
        pieceCodes: Array.isArray(entry.pieceCodes)
          ? entry.pieceCodes.map((code) => String(code).toUpperCase())
          : undefined,
        pieceChars: Array.isArray(entry.pieceChars)
          ? entry.pieceChars.map((char) => String(char))
          : undefined,
        trigger: {
          group:
            typeof (entry.trigger as Record<string, unknown> | undefined)?.group === 'string'
              ? String((entry.trigger as Record<string, unknown>).group)
              : undefined,
          type: String((entry.trigger as Record<string, unknown> | undefined)?.type ?? ''),
        },
        conditions: Array.isArray(entry.conditions)
          ? entry.conditions.map((condition) => ({
              type: String((condition as Record<string, unknown>).type ?? ''),
              params:
                typeof (condition as Record<string, unknown>).params === 'object' &&
                (condition as Record<string, unknown>).params
                  ? ({
                      ...((condition as Record<string, unknown>).params as Record<string, unknown>),
                    } as Record<string, unknown>)
                  : undefined,
            }))
          : [],
        effects: Array.isArray(entry.effects)
          ? entry.effects.map((effect) => ({
              type: String((effect as Record<string, unknown>).type ?? ''),
              target:
                typeof (effect as Record<string, unknown>).target === 'object' &&
                (effect as Record<string, unknown>).target
                  ? ({
                      ...((effect as Record<string, unknown>).target as Record<string, unknown>),
                    } as Record<string, unknown>)
                  : undefined,
              params:
                typeof (effect as Record<string, unknown>).params === 'object' &&
                (effect as Record<string, unknown>).params
                  ? ({
                      ...((effect as Record<string, unknown>).params as Record<string, unknown>),
                    } as Record<string, unknown>)
                  : undefined,
            }))
          : [],
      }))
      .filter((definition) => Number.isFinite(definition.skillId) && definition.skillId > 0),
  };
}
