// src/libs/redis.ts
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
export const redis = new IORedis(REDIS_URL);

/**
 * minuteKey / hourKey helpers:
 * minuteKey(new Date()) -> 'min:2025-11-04T10:59'
 * hourKey(new Date())   -> 'hour:2025-11-04T10'
 */
export function minuteKeyFor(ts: Date) {
  // ISO truncated to minutes
  return `min:${ts.toISOString().slice(0, 16)}`;
}
export function hourKeyFor(ts: Date) {
  return `hour:${ts.toISOString().slice(0, 13)}`; // YYYY-MM-DDTHH
}

export async function expireIfNew(key: string, ttlSeconds = 60 * 10) {
  // set TTL only if key is new (use SETNX pattern)
  const exists = await redis.exists(key);
  if (!exists) await redis.expire(key, ttlSeconds);
}
