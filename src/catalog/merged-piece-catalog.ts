import type { PieceCatalogProvider } from '@/catalog/contracts';
import { resolveGamePieceCode } from '@/catalog/game-piece-code';
import type { PieceDefinition } from '@/types/domain';

/** BFF カタログに無いスキル駒定義を InMemory 側で補完する */
export class MergedPieceCatalogProvider implements PieceCatalogProvider {
  constructor(
    private readonly primary: PieceCatalogProvider,
    private readonly fallback: PieceCatalogProvider,
  ) {}

  async listPieces(): Promise<PieceDefinition[]> {
    const [primaryPieces, fallbackPieces] = await Promise.all([
      this.primary.listPieces(),
      this.fallback.listPieces(),
    ]);

    const merged = primaryPieces.map((piece) => ({
      ...piece,
      moveVectors: piece.moveVectors.map((vector) => ({ ...vector })),
    }));
    const gameCodes = new Set(
      merged.map((piece) => resolveGamePieceCode(piece).toUpperCase()),
    );
    const primaryChars = new Set(merged.map((piece) => piece.char.trim()).filter(Boolean));
    const primaryCodes = new Set(merged.map((piece) => piece.pieceCode.toUpperCase()));

    for (const piece of fallbackPieces) {
      const gameCode = resolveGamePieceCode(piece).toUpperCase();
      const char = piece.char.trim();
      if (
        gameCodes.has(gameCode) ||
        primaryCodes.has(piece.pieceCode.toUpperCase()) ||
        (char && primaryChars.has(char))
      ) {
        continue;
      }
      merged.push({
        ...piece,
        moveVectors: piece.moveVectors.map((vector) => ({ ...vector })),
      });
      gameCodes.add(gameCode);
      if (char) primaryChars.add(char);
      primaryCodes.add(piece.pieceCode.toUpperCase());
    }

    return merged;
  }
}
