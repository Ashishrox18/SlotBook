import { sql } from "../db";

export interface BookingDetail {
  id: string;
  event_type_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  hold_expires_at: string | null;
  guest_name: string | null;
  guest_email: string | null;
  cancellation_reason: string | null;
  event_name: string;
  event_slug: string;
  duration_minutes: number;
  capacity: number;
  host_name: string;
  host_slug: string;
  host_timezone: string;
}

/** Fetch a booking by its private management token, with event + host context. */
export async function getBookingByToken(token: string): Promise<BookingDetail | null> {
  const rows = await sql<{
    id: string;
    event_type_id: string;
    starts_at: Date;
    ends_at: Date;
    status: string;
    hold_expires_at: Date | null;
    guest_name: string | null;
    guest_email: string | null;
    cancellation_reason: string | null;
    event_name: string;
    event_slug: string;
    duration_minutes: number;
    capacity: number;
    host_name: string;
    host_slug: string;
    host_timezone: string;
  }>`SELECT b.id, b.event_type_id, b.starts_at, b.ends_at, b.status, b.hold_expires_at,
           b.guest_name, b.guest_email, b.cancellation_reason,
           et.name AS event_name, et.slug AS event_slug, et.duration_minutes, et.capacity,
           h.name AS host_name, h.slug AS host_slug, h.timezone AS host_timezone
    FROM bookings b
    JOIN event_types et ON et.id = b.event_type_id
    JOIN hosts h ON h.id = et.host_id
    WHERE b.management_token = ${token}`;

  const r = rows.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    event_type_id: r.event_type_id,
    starts_at: new Date(r.starts_at).toISOString(),
    ends_at: new Date(r.ends_at).toISOString(),
    status: r.status,
    hold_expires_at: r.hold_expires_at ? new Date(r.hold_expires_at).toISOString() : null,
    guest_name: r.guest_name,
    guest_email: r.guest_email,
    cancellation_reason: r.cancellation_reason,
    event_name: r.event_name,
    event_slug: r.event_slug,
    duration_minutes: r.duration_minutes,
    capacity: r.capacity,
    host_name: r.host_name,
    host_slug: r.host_slug,
    host_timezone: r.host_timezone,
  };
}
