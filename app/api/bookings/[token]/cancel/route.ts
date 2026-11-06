export const runtime = "nodejs";
import type { NextRequest } from "next/server";
import { cancelBooking } from "@/lib/booking/cancel";
import { CancelSchema } from "@/lib/validation/schemas";
import { respond, clientIp, logReq } from "@/lib/observability/http";
import { rateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const start = Date.now();
  const ip = clientIp(req);
  if (!rateLimit(`cancel:${ip}`, RATE_LIMITS.cancel)) {
    return respond({ error: "Too many requests", code: "rate_limited" }, 429, req);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = CancelSchema.safeParse(body);
  if (!parsed.success) {
    return respond({ error: "Validation failed", issues: parsed.error.flatten() }, 400, req);
  }

  const result = await cancelBooking({ token: params.token, reason: parsed.data.cancellation_reason });
  logReq("cancel", req, result.statusCode, start);
  return respond(result.body, result.statusCode, req);
}
