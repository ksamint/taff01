import { Redis } from "ioredis";

export type RateLimiter = {
  /** Hits per window allowed for one key. */
  limit: number;
  /** Counts one hit and reports whether the key is still within `limit`. */
  hit(key: string): Promise<{ allowed: boolean; count: number }>;
  close(): Promise<void>;
};

/** Fixed one-minute windows per key, counted in Valkey; a failed count denies. */
export function createRateLimiter(
  redisUrl: string,
  limit: number,
): RateLimiter {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  redis.on("error", () => {
    /* Reported through the request path: a failed INCR denies the call. */
  });
  return {
    limit,
    async hit(key) {
      const window = Math.floor(Date.now() / 60_000);
      const bucket = `mcp:rl:${key}:${window}`;
      // One round trip, and the TTL is set only when the key is new (NX).
      const results = await redis
        .multi()
        .incr(bucket)
        .expire(bucket, 90, "NX")
        .exec();
      const count = Number(results?.[0]?.[1] ?? Number.POSITIVE_INFINITY);
      return { allowed: count <= limit, count };
    },
    close: async () => {
      await redis.quit();
    },
  };
}
