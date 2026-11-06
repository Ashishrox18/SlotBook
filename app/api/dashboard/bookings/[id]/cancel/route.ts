import type { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getHostBySlug } from "@/lib/availability/queries";
import { CancelSchema } from "@/lib/validation/schemas";
import { getDashboardHostSlug } from "@/lib/security/dashboard";
import { cancelBooking } from "@/lib/booking/cancel";
import { respond } from "@/lib/observability/http";

/**
 * Host-initiated cancellation. Ownership is verified by joining to the host's
 * event types; the actual lifecycle transition is delegated to the shared
 * cancelBooking() so the outbox event and capacity semantics stay consistent.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const slug = getDashboardHostSlug(req);
  if (!slug) return respond({ error: "Unauthorized", code: "unauthorized" }, 401, req);
  const host = await getHostBySlug(slug);
  if (!host) return respond({ error: "Host not found", code: "not_found" }, 404, req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = CancelSchema.safeParse(body);
  if (!parsed.success) return respond({ error: "Validation failed", issues: parsed.error.flatten() }, 400, req);

  const rows = await sql<{ management_token: string | null }>`
    SELECT b.management_token FROM bookings b
    JOIN event_types et ON et.id = b.event_type_id
    WHERE et.host_id = ${host.id} AND b.id = ${params.id}`;
  const row = rows.rows[0];
  if (!row || !row.management_token) {
    return respond({ error: "Booking not found", code: "not_found" }, 404, req);
  }

  const result = await cancelBooking({ token: row.management_token, reason: parsed.data.cancellation_reason });
  return respond(result.body, result.statusCode, req);
}
