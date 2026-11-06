import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal demo-host auth. A single shared passphrase (DEMO_HOST_PASSWORD) logs
 * the user in as the seeded host. The session cookie is a host slug plus an
 * HMAC signature over the slug using APP_SECRET, so it cannot be forged without
 * the secret. This is intentionally simple; production would use a real auth
 * provider. Correctness does not depend on this — it only guards the dashboard.
 */

const SECRET = process.env.APP_SECRET ?? "dev-app-secret-change-me";
const DEMO_PASSWORD = process.env.DEMO_HOST_PASSWORD ?? "slotbook-demo";

export const SESSION_COOKIE = "slotbook_host";

export function isDemoPassword(pw: string): boolean {
  return pw === DEMO_PASSWORD;
}

export function createSessionToken(hostSlug: string): string {
  const sig = createHmac("sha256", SECRET).update(hostSlug).digest("hex");
  return `${hostSlug}.${sig}`;
}

export function parseSessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx < 1) return null;
  const slug = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = createHmac("sha256", SECRET).update(slug).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  try {
    return timingSafeEqual(a, b) ? slug : null;
  } catch {
    return null;
  }
}

export function requireHostSlug(cookie: string | undefined | null): string | null {
  return parseSessionToken(cookie);
}
