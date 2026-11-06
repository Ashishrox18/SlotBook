export const runtime = "nodejs";
import type { NextRequest } from "next/server";
import { confirmHold } from "@/lib/booking/confirm";
import { ConfirmHoldSchema } from "@/lib/validation/schemas";
import { respond, clientIp, logReq } from "@/lib/observability/http";
import { rateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const start = Date.now();
  const ip = clientIp(req);
  if (!rateLimit(`confirm:${ip}`, RATE_LIMITS.confirm)) {
    return respond({ error: "Too many requests", code: "rate_limited" }, 429, req);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = ConfirmHoldSchema.safeParse(body);
  if (!parsed.success) {
    return respond({ error: "Validation failed", issues: parsed.error.flatten() }, 400, req);
  }

  const result = await confirmHold({
    holdId: params.id,
    guestName: parsed.data.guest_name,
    guestEmail: parsed.data.guest_email,
  });

  logReq("confirm", req, result.statusCode, start);
  return respond(result.body, result.statusCode, req);
}
