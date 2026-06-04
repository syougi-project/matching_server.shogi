export type MatchingServerConfig = {
  ratingBucketSize: number;
  /** 実験用: true ならレート帯に関係なく待機中の相手とマッチ */
  experimentalWideRatingMatch: boolean;
  reconnectGraceSeconds: number;
  queueTtlSeconds: number;
  matchmakingBatchSize: number;
  matchmakingBucketScanLimit: number;
  matchmakingBucketCandidateLimit: number;
  bffBaseUrl: string | null;
  matchingTicketSecret?: string | null;
  bffInternalToken?: string | null;
};

export function loadConfig(env = process.env): MatchingServerConfig {
  return {
    ratingBucketSize: parsePositiveInt(env.MATCHING_RATING_BUCKET_SIZE, 100),
    // 一旦実験用デフォルト ON。本番前は MATCHING_EXPERIMENT_WIDE_RATING=false を推奨
    experimentalWideRatingMatch: parseBooleanFlag(env.MATCHING_EXPERIMENT_WIDE_RATING, true),
    reconnectGraceSeconds: parsePositiveInt(env.MATCHING_RECONNECT_GRACE_SECONDS, 30),
    queueTtlSeconds: parsePositiveInt(env.MATCHING_QUEUE_TTL_SECONDS, 120),
    matchmakingBatchSize: parsePositiveInt(env.MATCHING_BATCH_SIZE, 20),
    matchmakingBucketScanLimit: parsePositiveInt(env.MATCHING_BUCKET_SCAN_LIMIT, 50),
    matchmakingBucketCandidateLimit: parsePositiveInt(env.MATCHING_BUCKET_CANDIDATE_LIMIT, 25),
    bffBaseUrl: normalizeUrl(env.MATCHING_BFF_BASE_URL),
    matchingTicketSecret: normalizeSecret(env.MATCHING_TICKET_SECRET),
    bffInternalToken: normalizeSecret(env.MATCHING_BFF_INTERNAL_TOKEN),
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseBooleanFlag(raw: string | undefined, fallback: boolean) {
  if (raw === undefined || raw.trim() === '') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  return fallback;
}

function normalizeUrl(raw: string | undefined) {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
}

function normalizeSecret(raw: string | undefined) {
  const trimmed = raw?.trim();
  return trimmed || null;
}
