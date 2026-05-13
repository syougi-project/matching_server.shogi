import type { PieceDefinition } from '@/types/domain';

export interface PieceCatalogProvider {
  listPieces(): Promise<PieceDefinition[]>;
}
