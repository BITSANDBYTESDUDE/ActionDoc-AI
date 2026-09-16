/**
 * Fixed-window rate limiter.
 *
 * Uses Redis when configured (works across serverless instances); otherwise a
 * bounded in-memory map is used which is only correct for single-instance
 * deployments. The in-memory store is capped so it cannot grow unbounded.
 */
import { getRedis } from '@/lib/db/redis';
import { RateLimitedError } from '@/lib/errors';

interface Bucket {
  count: number;
  resetAt: number;
}

const memoryBuckets = new Map<string, Bucket>();
const MAX_MEMORY_BUCKETS = 10_000;

function pruneMemoryBuckets(now: number) {
  if (memoryBuckets.size <= MAX_MEMORY_BUCKETS) return;
  for (const [key, bucket] of memoryBuckets) {
    if (bucket.resetAt <= now) memoryBuckets.delete(key);
    if (memoryBuckets.size <= MAX_MEMORY_BUCKETS / 2) break;
  }
}

export interface RateLimitOptions {
  /** Stable bucket identifier, e.g. `documents:upload:<userId>`. */
  key: string;
  limit?: number;
  windowSeconds?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const limit = options.limit ?? Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 120);
  const windowSeconds = options.windowSeconds ?? Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60);
  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  const redis = getRedis();

  if (redis) {
    const redisKey = `ratelimit:${options.key}:${Math.floor(now / windowMs)}`;
    try {
      const results = await redis.multi().incr(redisKey).pttl(redisKey).exec();
      const count = Number(results?.[0]?.[1] ?? 1);
      let ttl = Number(results?.[1]?.[1] ?? -1);
      if (ttl < 0) {
        await redis.pexpire(redisKey, windowMs);
        ttl = windowMs;
      }
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetAt: now + ttl,
      };
    } catch (error) {
      console.error('[rate-limit] redis unavailable, falling back to memory', error);
    }
  }

  pruneMemoryBuckets(now);
  const bucket = memoryBuckets.get(options.key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    memoryBuckets.set(options.key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export async function enforceRateLimit(options: RateLimitOptions): Promise<void> {
  const result = await checkRateLimit(options);
  if (!result.allowed) {
    throw new RateLimitedError(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)));
  }
}

export function resetRateLimits() {
  memoryBuckets.clear();
}