export type MatchingServerConfig = {
  ratingBucketSize: number;
  reconnectGraceSeconds: number;
  queueTtlSeconds: number;
  bffBaseUrl: string | null;
};

export function loadConfig(env = process.env): MatchingServerConfig {
  return {
    ratingBucketSize: parsePositiveInt(env.MATCHING_RATING_BUCKET_SIZE, 100),
    reconnectGraceSeconds: parsePositiveInt(env.MATCHING_RECONNECT_GRACE_SECONDS, 30),
    queueTtlSeconds: parsePositiveInt(env.MATCHING_QUEUE_TTL_SECONDS, 120),
    bffBaseUrl: normalizeUrl(env.MATCHING_BFF_BASE_URL),
  };
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
