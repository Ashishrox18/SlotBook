export const runtime = "nodejs";
import type { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getHostBySlug } from "@/lib/availability/queries";
import { getDashboardHostSlug } from "@/lib/security/dashboard";
import { respond } from "@/lib/observability/http";

interface DashboardBookingRow {
  id: string;
  status: string;
  starts_at: Date;
  ends_at: Date;
  guest_name: string | null;
  guest_email: string | null;
  cancellation_reason: string | null;
  management_token: string | null;
  event_name: string;
  event_slug: string;
}

export async function GET(req: NextRequest) {
  const slug = getDashboardHostSlug(req);
  if (!slug) return respond({ error: "Unauthorized", code: "unauthorized" }, 401, req);
  const host = await getHostBySlug(slug);
  if (!host) return respond({ error: "Host not found", code: "not_found" }, 404, req);

  const rows = await sql<DashboardBookingRow>`
    SELECT b.id, b.status, b.starts_at, b.ends_at, b.guest_name, b.guest_email,
           b.cancellation_reason, b.management_token, et.name AS event_name, et.slug AS event_slug
    FROM bookings b
    JOIN event_types et ON et.id = b.event_type_id
    WHERE et.host_id = ${host.id} AND b.starts_at >= now() AND b.status IN ('held', 'confirmed')
    ORDER BY b.starts_at ASC LIMIT 100`;

  const bookings = rows.rows.map((r) => ({
    id: r.id,
    status: r.status,
    starts_at: new Date(r.starts_at).toISOString(),
    ends_at: new Date(r.ends_at).toISOString(),
    guest_name: r.guest_name,
    guest_email: r.guest_email,
    cancellation_reason: r.cancellation_reason,
    management_token: r.management_token,
    event_name: r.event_name,
    event_slug: r.event_slug,
  }));

  return respond({ bookings }, 200, req);
}
