import { describe, expect, test } from 'bun:test';
import { BffPieceCatalogProvider } from '@/catalog/bff-piece-catalog';
import { RuleSnapshotBuilder } from '@/catalog/rule-snapshot';

describe('RuleSnapshotBuilder', () => {
  test('normalizes piece codes and flattens skill definitions', async () => {
    const builder = new RuleSnapshotBuilder({
      async listPieces() {
        return [
          {
            pieceCode: 'mist',
            canonicalCode: 'mist',
            char: '霧',
            name: 'Mist',
            skill: 'x',
            moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
            canJump: false,
            isPromoted: false,
            promotable: false,
            moveConstraints: { a: 1 },
            moveRules: [{ ruleType: 'r', priority: 1, params: { x: 1 } }],
            skillDefinitionsV2: {
              definitions: [
                {
                  skillId: 39,
                  pieceCodes: ['mist'],
                  pieceChars: ['霧'],
                  trigger: { type: 'after_move' },
                  conditions: [],
                  effects: [{ type: 'send_to_hand', params: { maxTargets: 1 } }],
                },
              ],
            },
          },
        ];
      },
    });

    const snapshot = await builder.buildSnapshot();

    expect(snapshot.piecesByCode.MIST?.pieceCode).toBe('MIST');
    expect(snapshot.piecesByCode.MIST?.canonicalCode).toBe('MIST');
    expect(snapshot.skillDefinitions[0]?.pieceCodes).toEqual(['MIST']);
    expect(snapshot.createdAt).toMatch(/T/);
  });

  test('registers standard game-code aliases for opaque BFF piece codes', async () => {
    const builder = new RuleSnapshotBuilder({
      async listPieces() {
        return [
          {
            pieceCode: 'piece_c518b11858f2',
            canonicalCode: 'pawn',
            sfenCode: 'P',
            char: '歩',
            name: 'Pawn',
            skill: '',
            moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
          },
        ];
      },
    });

    const snapshot = await builder.buildSnapshot();

    expect(snapshot.piecesByCode.PIECE_C518B11858F2?.pieceCode).toBe('PIECE_C518B11858F2');
    expect(snapshot.piecesByCode.FU?.pieceCode).toBe('FU');
    expect(snapshot.piecesByCode['歩']?.pieceCode).toBe('FU');
    expect(snapshot.piecesByCode.FU?.moveVectors).toEqual([
      { dx: 0, dy: -1, maxStep: 1 },
    ]);
  });
});

describe('BffPieceCatalogProvider', () => {
  test('maps BFF piece catalog response into server piece definitions', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((async () =>
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            items: [
              {
                pieceCode: 'mist',
                canonicalCode: 'mist',
                char: '霧',
                name: 'Mist',
                skill: 'adjacent',
                moveVectors: [{ dx: 0, dy: -1, maxStep: 1 }],
                canJump: false,
                isPromoted: false,
                moveConstraints: { scope: 'x' },
                moveRules: [{ ruleType: 'r', priority: 1, params: { p: 1 } }],
                skillDefinitionsV2: {
                  definitions: [
                    {
                      skillId: 39,
                      pieceCodes: ['mist'],
                      pieceChars: ['霧'],
                      trigger: { type: 'after_move' },
                      conditions: [{ type: 'chance_roll', params: { procChance: 0.3 } }],
                      effects: [
                        {
                          type: 'send_to_hand',
                          target: { group: 'adjacent' },
                          params: { handOwner: 'target_owner' },
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as unknown) as typeof fetch;

    try {
      const provider = new BffPieceCatalogProvider('http://localhost:3000');
      const pieces = await provider.listPieces();

      expect(pieces).toHaveLength(1);
      expect(pieces[0]?.pieceCode).toBe('MIST');
      expect(pieces[0]?.canonicalCode).toBe('MIST');
      expect(pieces[0]?.skillDefinitionsV2?.definitions[0]?.pieceCodes).toEqual(['MIST']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
