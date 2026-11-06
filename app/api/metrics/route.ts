import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { metricsSnapshot } from "@/lib/observability/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await sql<{ status: string; count: string }>`
    SELECT status, count(*)::text AS count FROM bookings GROUP BY status`;
  const notif = await sql<{ event_type: string; count: string }>`
    SELECT event_type, count(*)::text AS count FROM notification_events GROUP BY event_type`;

  return NextResponse.json({
    counters: metricsSnapshot(),
    bookings_by_status: Object.fromEntries(status.rows.map((r) => [r.status, Number(r.count)])),
    notifications_by_type: Object.fromEntries(notif.rows.map((r) => [r.event_type, Number(r.count)])),
  });
}
