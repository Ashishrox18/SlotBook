import type { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { bookingDto } from "@/lib/booking/dto";
import { respond, clientIp, logReq } from "@/lib/observability/http";
import { rateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

interface BookingDetailRow {
  id: string;
  event_type_id: string;
  starts_at: Date;
  ends_at: Date;
  status: string;
  hold_expires_at: Date | null;
  guest_name: string | null;
  guest_email: string | null;
  cancellation_reason: string | null;
  created_at: Date;
  updated_at: Date;
  event_name: string;
  event_slug: string;
  duration_minutes: number;
  capacity: number;
  host_name: string;
  host_slug: string;
  host_timezone: string;
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const start = Date.now();
  const ip = clientIp(req);
  if (!rateLimit(`bookingRead:${ip}`, RATE_LIMITS.bookingRead)) {
    return respond({ error: "Too many requests", code: "rate_limited" }, 429, req);
  }

  const rows = await sql<BookingDetailRow>`
    SELECT b.id, b.event_type_id, b.starts_at, b.ends_at, b.status, b.hold_expires_at,
           b.guest_name, b.guest_email, b.cancellation_reason, b.created_at, b.updated_at,
           et.name AS event_name, et.slug AS event_slug, et.duration_minutes, et.capacity,
           h.name AS host_name, h.slug AS host_slug, h.timezone AS host_timezone
    FROM bookings b
    JOIN event_types et ON et.id = b.event_type_id
    JOIN hosts h ON h.id = et.host_id
    WHERE b.management_token = ${params.token}`;

  const row = rows.rows[0];
  if (!row) {
    logReq("bookingRead", req, 404, start);
    return respond({ error: "Booking not found", code: "booking_not_found" }, 404, req);
  }

  logReq("bookingRead", req, 200, start);
  return respond(
    {
      ...bookingDto({
        id: row.id,
        event_type_id: row.event_type_id,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        status: row.status as never,
        hold_expires_at: row.hold_expires_at,
        guest_name: row.guest_name,
        guest_email: row.guest_email,
        management_token: null,
        cancellation_reason: row.cancellation_reason,
        created_by_ip: null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }),
      event_type: { name: row.event_name, slug: row.event_slug, duration_minutes: row.duration_minutes, capacity: row.capacity },
      host: { name: row.host_name, slug: row.host_slug, timezone: row.host_timezone },
    },
    200,
    req,
  );
}
