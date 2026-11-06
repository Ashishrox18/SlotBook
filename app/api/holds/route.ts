export const runtime = "nodejs";
import type { NextRequest } from "next/server";
import { createHold } from "@/lib/booking/holds";
import { CreateHoldSchema } from "@/lib/validation/schemas";
import { respond, clientIp, logReq } from "@/lib/observability/http";
import { rateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

export async function POST(req: NextRequest) {
  const start = Date.now();
  const ip = clientIp(req);
  if (!rateLimit(`holds:${ip}`, RATE_LIMITS.holdCreate)) {
    return respond({ error: "Too many requests", code: "rate_limited" }, 429, req);
  }

  const idempotencyKey = req.headers.get("idempotency-key");
  if (!idempotencyKey || idempotencyKey.length < 8) {
    return respond(
      { error: "Idempotency-Key header is required (minimum 8 characters)", code: "missing_idempotency_key" },
      400,
      req,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return respond({ error: "Invalid JSON body", code: "invalid_body" }, 400, req);
  }

  const parsed = CreateHoldSchema.safeParse(body);
  if (!parsed.success) {
    return respond({ error: "Validation failed", issues: parsed.error.flatten() }, 400, req);
  }

  const result = await createHold({
    idempotencyKey,
    eventTypeId: parsed.data.event_type_id,
    startsAtIso: parsed.data.starts_at,
    ip,
  });

  logReq("holds", req, result.statusCode, start);
  return respond(result.body, result.statusCode, req);
}
