import { BffPieceCatalogProvider } from '@/catalog/bff-piece-catalog';
import { RuleSnapshotBuilder } from '@/catalog/rule-snapshot';
import { BasicRuleEngine } from '@/game/basic-rule-engine';

const bffUrl = process.env.MATCHING_BFF_BASE_URL ?? 'https://4tibwwb4j6.execute-api.ap-northeast-1.amazonaws.com';
const builder = new RuleSnapshotBuilder(new BffPieceCatalogProvider(bffUrl));
const rules = await builder.buildSnapshot();
const engine = new BasicRuleEngine();

const boardState: Record<string, string> = {
  '9g': 'black:PIECE_C518B11858F2',
  '8g': 'black:PIECE_C518B11858F2',
  '7g': 'black:PIECE_C518B11858F2',
  '6g': 'black:PIECE_C518B11858F2',
  '5g': 'black:PIECE_C518B11858F2',
  '4g': 'black:PIECE_C518B11858F2',
  '3g': 'black:PIECE_C518B11858F2',
  '2g': 'black:PIECE_C518B11858F2',
  '1g': 'black:PIECE_C518B11858F2',
  '5i': 'black:OU',
  '5a': 'white:OU',
};

const game = {
  boardState,
  handsState: { black: {}, white: {} },
  skillState: { board_hazards: [], board_arrow_tiles: [], movement_modifiers: [], piece_statuses: [], piece_defenses: [] },
  turn: 'black' as const,
  moveCount: 0,
  version: 1,
};

const moves = [
  { from: '7g', to: '7f', piece: 'PIECE_C518B11858F2', promote: false, drop: false },
  { from: '7g', to: '7f', piece: 'FU', promote: false, drop: false },
  { from: '9g', to: '9f', piece: 'PIECE_C518B11858F2', promote: false, drop: false },
];

console.log('has piece def', {
  hash: Boolean(rules.piecesByCode.PIECE_C518B11858F2),
  fu: Boolean(rules.piecesByCode.FU),
  hashVectors: rules.piecesByCode.PIECE_C518B11858F2?.moveVectors,
});

for (const move of moves) {
  const result = engine.applyMove({ game, rules, actorSide: 'black', move });
  console.log(move, result.ok ? 'OK' : result);
}
