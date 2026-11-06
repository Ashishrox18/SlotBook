export const runtime = "nodejs";
import type { NextRequest } from "next/server";
import { rescheduleBooking } from "@/lib/booking/reschedule";
import { RescheduleSchema } from "@/lib/validation/schemas";
import { respond, clientIp, logReq } from "@/lib/observability/http";
import { rateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const start = Date.now();
  const ip = clientIp(req);
  if (!rateLimit(`reschedule:${ip}`, RATE_LIMITS.reschedule)) {
    return respond({ error: "Too many requests", code: "rate_limited" }, 429, req);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = RescheduleSchema.safeParse(body);
  if (!parsed.success) {
    return respond({ error: "Validation failed", issues: parsed.error.flatten() }, 400, req);
  }

  const result = await rescheduleBooking({ token: params.token, newStartsAtIso: parsed.data.starts_at });
  logReq("reschedule", req, result.statusCode, start);
  return respond(result.body, result.statusCode, req);
}
