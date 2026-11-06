import type { NextRequest } from "next/server";
import { SESSION_COOKIE, parseSessionToken } from "./auth";

/** Returns the authenticated demo host's slug, or null. */
export function getDashboardHostSlug(req: NextRequest): string | null {
  return parseSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}
