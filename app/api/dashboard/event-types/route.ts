export const runtime = "nodejs";
import type { NextRequest } from "next/server";
import { sql, isUniqueViolation } from "@/lib/db";
import { getHostBySlug } from "@/lib/availability/queries";
import { EventTypeCreateSchema } from "@/lib/validation/schemas";
import type { EventType } from "@/lib/types";
import { getDashboardHostSlug } from "@/lib/security/dashboard";
import { respond } from "@/lib/observability/http";

export async function GET(req: NextRequest) {
  const slug = getDashboardHostSlug(req);
  if (!slug) return respond({ error: "Unauthorized", code: "unauthorized" }, 401, req);
  const host = await getHostBySlug(slug);
  if (!host) return respond({ error: "Host not found", code: "not_found" }, 404, req);
  const rows = await sql<EventType>`SELECT * FROM event_types WHERE host_id = ${host.id} ORDER BY name`;
  return respond({ event_types: rows.rows }, 200, req);
}

export async function POST(req: NextRequest) {
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
      INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity,
        buffer_before_minutes, buffer_after_minutes, minimum_notice_minutes, booking_horizon_days)
      VALUES (${host.id}, ${d.name}, ${d.slug}, ${d.duration_minutes}, ${d.capacity},
        ${d.buffer_before_minutes}, ${d.buffer_after_minutes}, ${d.minimum_notice_minutes}, ${d.booking_horizon_days})
      RETURNING *`;
    return respond(rows.rows[0], 201, req);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return respond({ error: "An event type with this slug already exists", code: "slug_conflict" }, 409, req);
    }
    throw err;
  }
}
