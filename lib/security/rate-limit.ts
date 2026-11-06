/**
 * In-memory fixed-window rate limiter.
 *
 * IMPORTANT: this is ABUSE PROTECTION ONLY, not a correctness mechanism. It
 * throttles floods from a single client/IP so a bot cannot hold every slot or
 * hammer the API. Booking correctness (capacity, holds, expiry) is enforced
 * entirely in PostgreSQL; this limiter could be removed and the system would
 * still never overbook. It does not survive restarts and is per-process.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

export function resetRateLimits(): void {
  buckets.clear();
}

/** Requests per minute per IP, per endpoint group. */
export const RATE_LIMITS = {
  holdCreate: 30,
  confirm: 30,
  reschedule: 30,
  cancel: 30,
  slotsRead: 120,
  bookingRead: 120,
} as const;
