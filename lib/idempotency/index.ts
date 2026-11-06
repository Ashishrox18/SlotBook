import { createHash } from "node:crypto";

/** How long an idempotency record is reused for replay. */
export const IDEMPOTENCY_TTL_HOURS = 24;

/**
 * Deterministic hash of a request payload. Keys are deep-sorted so that two
 * semantically identical bodies (different key order) produce the same hash,
 * and a different payload with the same Idempotency-Key is detected as a conflict.
 */
export function hashRequest(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortDeep);
  const obj = value as Record<string, unknown>;
  return Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = sortDeep(obj[k]);
      return acc;
    }, {});
}

/** Expiry instant (ISO) for a new idempotency record, relative to DB now. */
export function idempotencyExpiryIso(nowIso: string): string {
  return new Date(new Date(nowIso).getTime() + IDEMPOTENCY_TTL_HOURS * 3600_000).toISOString();
}
