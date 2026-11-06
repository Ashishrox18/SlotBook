import type { NextRequest } from "next/server";
import { sql, isUniqueViolation } from "@/lib/db";
import { getHostBySlug } from "@/lib/availability/queries";
import { EventTypeCreateSchema } from "@/lib/validation/schemas";
import type { EventType } from "@/lib/types";
import { getDashboardHostSlug } from "@/lib/security/dashboard";
import { respond } from "@/lib/observability/http";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const slug = getDashboardHostSlug(req);
  if (!slug) return respond({ error: "Unauthorized", code: "unauthorized" }, 401, req);
  const host = await getHostBySlug(slug);
  if (!host) return respond({ error: "Host not found", code: "not_found" }, 404, req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return respond({ error: "Invalid body", code: "invalid_body" }, 400, req);
  }
  const parsed = EventTypeCreateSchema.safeParse(body);
  if (!parsed.success) return respond({ error: "Validation failed", issues: parsed.error.flatten() }, 400, req);
  const d = parsed.data;

  try {
    const rows = await sql<EventType>`
      UPDATE event_types SET name = ${d.name}, slug = ${d.slug}, duration_minutes = ${d.duration_minutes},
        capacity = ${d.capacity}, buffer_before_minutes = ${d.buffer_before_minutes},
        buffer_after_minutes = ${d.buffer_after_minutes}, minimum_notice_minutes = ${d.minimum_notice_minutes},
        booking_horizon_days = ${d.booking_horizon_days}, updated_at = now()
      WHERE id = ${params.id} AND host_id = ${host.id} RETURNING *`;
    if (!rows.rows[0]) return respond({ error: "Event type not found", code: "not_found" }, 404, req);
    return respond(rows.rows[0], 200, req);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return respond({ error: "An event type with this slug already exists", code: "slug_conflict" }, 409, req);
    }
    throw err;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const slug = getDashboardHostSlug(req);
  if (!slug) return respond({ error: "Unauthorized", code: "unauthorized" }, 401, req);
  const host = await getHostBySlug(slug);
  if (!host) return respond({ error: "Host not found", code: "not_found" }, 404, req);
  await sql`DELETE FROM event_types WHERE id = ${params.id} AND host_id = ${host.id}`;
  return respond({ ok: true }, 200, req);
}
