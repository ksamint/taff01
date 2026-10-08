import { Redis } from "ioredis";

export type RateLimiter = {
  /** Returns true when the key stays within `limit` hits per window. */
  hit(key: string): Promise<boolean>;
  close(): Promise<void>;
};

/** Fixed one-minute windows per token, counted in Valkey. */
export function createRateLimiter(
  redisUrl: string,
  limit: number,
): RateLimiter {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  redis.on("error", () => {
    /* Reported through the request path: a failed INCR denies the call. */
  });
  return {
    async hit(key) {
      const window = Math.floor(Date.now() / 60_000);
      const bucket = `mcp:rl:${key}:${window}`;
      const count = await redis.incr(bucket);
      if (count === 1) await redis.expire(bucket, 90);
      return count <= limit;
    },
    close: async () => {
      await redis.quit();
    },
  };
}
