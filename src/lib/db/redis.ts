/**
 * Lightweight Redis client used for rate limiting and other cross-request
 * counters. When REDIS_URL is absent the client is null and callers fall back
 * to a bounded in-memory implementation (single-instance deployments only).
 */
import Redis, { type Redis as RedisClient } from 'ioredis';

let client: RedisClient | null = null;
let failed = false;

export function getRedis(): RedisClient | null {
  if (failed) return null;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (client) return client;

  try {
    client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
    });
    client.on('error', (error) => {
      console.error('[redis] connection error', error.message);
    });
  } catch (error) {
    console.error('[redis] failed to initialise', error);
    failed = true;
    client = null;
  }

  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => undefined);
    client = null;
  }
}