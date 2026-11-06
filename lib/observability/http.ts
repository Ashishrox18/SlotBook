import { NextResponse, type NextRequest } from "next/server";
import { logger } from "./logger";
import { normaliseError } from "./errors";

export function requestIdOf(req: NextRequest): string {
  return req.headers.get("x-request-id") ?? "unknown";
}

/** JSON response that echoes X-Request-ID. Error bodies are normalised to the standard envelope. */
export function respond(body: unknown, status: number, req?: NextRequest): NextResponse {
  const requestId = req ? requestIdOf(req) : undefined;
  const payload = status >= 400 ? normaliseError(body, requestId) : body;
  const res = NextResponse.json(payload, { status });
  if (requestId) res.headers.set("x-request-id", requestId);
  return res;
}

/** Best-effort client IP for rate limiting / abuse protection. */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Structured access log line for a single API call. */
export function logReq(group: string, req: NextRequest, status: number, start: number): void {
  logger.info("request", {
    group,
    method: req.method,
    route: req.nextUrl.pathname,
    status,
    durationMs: Date.now() - start,
    requestId: requestIdOf(req),
  });
}
