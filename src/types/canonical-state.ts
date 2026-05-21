/** app.shogi 正典局面（先手=black→player, 後手=white→enemy） */
export type MatchingCanonicalState = {
  sideToMove: 'player' | 'enemy';
  turnNumber: number;
  moveCount: number;
  sfen: string;
  stateHash: string | null;
  boardState: Record<string, unknown>;
  hands: {
    player: Partial<Record<string, number>>;
    enemy: Partial<Record<string, number>>;
  };
};
