import { randomBytes } from "node:crypto";
import { sql } from "./db";

export interface EventTypeOpts {
  name?: string;
  slug?: string;
  duration?: number;
  capacity?: number;
  bufferBefore?: number;
  bufferAfter?: number;
  minimumNotice?: number;
  horizon?: number;
}

export async function createHost(opts: { slug?: string; name?: string; timezone?: string } = {}): Promise<string> {
  const slug = opts.slug ?? "test-host";
  const res = await sql<{ id: string }>`INSERT INTO hosts (slug, name, timezone)
    VALUES (${slug}, ${opts.name ?? "Test Host"}, ${opts.timezone ?? "America/New_York"}) RETURNING id`;
  return res.rows[0]!.id;
}

export async function createEventType(hostId: string, opts: EventTypeOpts = {}): Promise<string> {
  const res = await sql<{ id: string }>`INSERT INTO event_types
    (host_id, name, slug, duration_minutes, capacity, buffer_before_minutes, buffer_after_minutes,
     minimum_notice_minutes, booking_horizon_days)
    VALUES (${hostId}, ${opts.name ?? "Test"}, ${opts.slug ?? "test"},
      ${opts.duration ?? 30}, ${opts.capacity ?? 1}, ${opts.bufferBefore ?? 0}, ${opts.bufferAfter ?? 0},
      ${opts.minimumNotice ?? 0}, ${opts.horizon ?? 60}) RETURNING id`;
  return res.rows[0]!.id;
}

export async function addWeeklyWindow(hostId: string, weekday: number, start: string, end: string): Promise<void> {
  await sql`INSERT INTO weekly_availability (host_id, weekday, start_local_time, end_local_time)
    VALUES (${hostId}, ${weekday}, ${start}, ${end})`;
}

export async function addOverride(
  hostId: string,
  localDate: string,
  type: "day_off" | "custom_hours",
  start?: string,
  end?: string,
): Promise<void> {
  await sql`INSERT INTO availability_overrides (host_id, local_date, override_type, start_local_time, end_local_time)
    VALUES (${hostId}, ${localDate}, ${type}, ${start ?? null}, ${end ?? null})`;
}

/** Insert an active (confirmed) booking directly, bypassing the API. */
export async function insertBooking(
  eventTypeId: string,
  startsAtIso: string,
  opts: { status?: string; capacityHolder?: boolean } = {},
): Promise<{ id: string; management_token: string }> {
  const token = randomBytes(16).toString("hex");
  const status = opts.status ?? "confirmed";
  const holdExpiry = status === "held" ? new Date(Date.now() + 5 * 60_000).toISOString() : null;
  const res = await sql<{ id: string }>`INSERT INTO bookings
    (event_type_id, starts_at, ends_at, status, hold_expires_at, guest_name, guest_email, management_token)
    VALUES (${eventTypeId}, ${startsAtIso}, ${(new Date(new Date(startsAtIso).getTime() + 30 * 60_000)).toISOString()},
      ${status}, ${holdExpiry}, ${opts.capacityHolder ? null : "Guest"}, ${opts.capacityHolder ? null : "g@example.com"}, ${token})
    RETURNING id`;
  return { id: res.rows[0]!.id, management_token: token };
}
