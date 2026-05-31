export type MatchingServerConfig = {
  ratingBucketSize: number;
  reconnectGraceSeconds: number;
  queueTtlSeconds: number;
  matchmakingBatchSize: number;
  matchmakingBucketScanLimit: number;
  matchmakingBucketCandidateLimit: number;
  bffBaseUrl: string | null;
  matchingTicketSecret?: string | null;
  bffInternalToken?: string | null;
  /** app.shogi ルート（設定時は本番エンジンで着手検証） */
  appShogiRoot?: string | null;
};

export function loadConfig(env = process.env): MatchingServerConfig {
  return {
    ratingBucketSize: parsePositiveInt(env.MATCHING_RATING_BUCKET_SIZE, 100),
    reconnectGraceSeconds: parsePositiveInt(env.MATCHING_RECONNECT_GRACE_SECONDS, 30),
    queueTtlSeconds: parsePositiveInt(env.MATCHING_QUEUE_TTL_SECONDS, 120),
    matchmakingBatchSize: parsePositiveInt(env.MATCHING_BATCH_SIZE, 20),
    matchmakingBucketScanLimit: parsePositiveInt(env.MATCHING_BUCKET_SCAN_LIMIT, 50),
    matchmakingBucketCandidateLimit: parsePositiveInt(env.MATCHING_BUCKET_CANDIDATE_LIMIT, 25),
    bffBaseUrl: normalizeUrl(env.MATCHING_BFF_BASE_URL),
    matchingTicketSecret: normalizeSecret(env.MATCHING_TICKET_SECRET),
    bffInternalToken: normalizeSecret(env.MATCHING_BFF_INTERNAL_TOKEN),
    appShogiRoot: normalizeAppRoot(env.APP_SHOGI_ROOT),
  };
}

function normalizeAppRoot(raw: string | undefined) {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return trimmed;
}

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
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
