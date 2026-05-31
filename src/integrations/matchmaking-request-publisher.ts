export type MatchmakingRequestPublisher = {
  requestMatchmaking(input: { queueEntryId: string; ratingBucket: number }): Promise<void>;
};

export class NoopMatchmakingRequestPublisher implements MatchmakingRequestPublisher {
  async requestMatchmaking(): Promise<void> {
    return undefined;
  }
}

