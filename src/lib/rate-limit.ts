/**
 * In-process rate limiting.
 *
 * The daily token quota in the route is a *spend* guard, and it is checked
 * before a turn and written after it — so N parallel requests all read the same
 * "under budget" value and all pass. That is fine as a spend ceiling and
 * useless as a burst guard. This module adds the missing piece: a sliding
 * window on requests and a hard cap on concurrent streams, both enforced
 * *before* any provider call.
 *
 * Scope and honesty about it
 *   * State lives in this process. On a single Node server (the documented
 *     deployment) that is exactly right. On a multi-instance deployment each
 *     instance enforces its own share, so the effective limit is
 *     `limit × instances`. For a hard global limit, back this with Redis or a
 *     Postgres counter — the interface below is deliberately small so that
 *     swap is a one-file change.
 *   * The map is swept on access, so an idle server does not leak memory.
 */

import { env } from "./env";

interface Bucket {
  /** Timestamps (ms) of accepted requests inside the current window. */
  hits: number[];
  /** Turns currently streaming for this user. */
  inFlight: number;
}

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;

/** Drop buckets that are idle and empty so the map cannot grow forever. */
function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    const stale =
      bucket.inFlight === 0 &&
      (bucket.hits.length === 0 ||
        now - bucket.hits[bucket.hits.length - 1] > WINDOW_MS);
    if (stale) buckets.delete(key);
  }
}

export interface RateLimitDecision {
  ok: boolean;
  /** Seconds until the caller may retry. Only set when `ok` is false. */
  retryAfterSeconds?: number;
  reason?: "rate" | "concurrency";
}

/**
 * Reserve a slot for one turn. Call this before doing any work; if it returns
 * `ok: false`, respond 429 and do not touch the database or a provider.
 */
export function acquireTurn(userId: string): RateLimitDecision {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(userId) ?? { hits: [], inFlight: 0 };

  // Sliding window: forget anything older than a minute.
  bucket.hits = bucket.hits.filter((at) => now - at < WINDOW_MS);

  if (bucket.inFlight >= env.rateLimitMaxConcurrent) {
    buckets.set(userId, bucket);
    return { ok: false, reason: "concurrency", retryAfterSeconds: 5 };
  }

  if (bucket.hits.length >= env.rateLimitPerMinute) {
    const oldest = bucket.hits[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((WINDOW_MS - (now - oldest)) / 1000),
    );
    buckets.set(userId, bucket);
    return { ok: false, reason: "rate", retryAfterSeconds };
  }

  bucket.hits.push(now);
  bucket.inFlight += 1;
  buckets.set(userId, bucket);
  return { ok: true };
}

/**
 * Release the concurrency slot for a turn. Must run exactly once per
 * successful `acquireTurn`, including on every error path.
 */
export function releaseTurn(userId: string): void {
  const bucket = buckets.get(userId);
  if (!bucket) return;
  bucket.inFlight = Math.max(0, bucket.inFlight - 1);
}

/** Test/ops helper: forget all state. */
export function resetRateLimits(): void {
  buckets.clear();
}
