import { DateTime } from "luxon";
import { sql, sqlFor, withTransaction } from "../db";
import { getOverrides, getWeeklyAvailability } from "../availability/queries";
import { isValidSlotPlacement } from "../availability/slots";
import { lockSlot } from "./locks";
import { recordNotification } from "./notifications";
import { bookingDto } from "./dto";
import { inc, METRICS } from "../observability/metrics";
import type { Booking, EventType } from "../types";

export interface RescheduleInput {
  token: string;
  newStartsAtIso: string;
}

export interface RescheduleResult {
  statusCode: number;
  body: unknown;
}

interface LookupRow extends Pick<Booking, "id" | "event_type_id" | "status" | "starts_at" | "ends_at"> {
  duration_minutes: number;
  capacity: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_minutes: number;
  booking_horizon_days: number;
  event_name: string;
  event_slug: string;
  host_id: string;
  host_timezone: string;
  host_slug: string;
  host_name: string;
}

/**
 * Reschedule a confirmed booking to a new slot ATOMICALLY.
 *
 * We do NOT cancel-then-create. Instead, within one transaction we:
 *   1. Acquire the advisory lock for the NEW slot (so capacity there is checked
 *      safely, just like hold creation).
 *   2. Lock the booking row and re-confirm it is still confirmed.
 *   3. Validate the new slot placement (availability, notice, horizon).
 *   4. Count active bookings at the new slot EXCLUDING this booking; reject if
 *      at capacity. Because we hold the new-slot lock, this count is authoritative.
 *   5. UPDATE the booking in place (identity + management token preserved).
 *   6. Write booking.rescheduled in the same transaction.
 *
 * This guarantees the guest is never left with no booking: the row only changes
 * once the new slot has capacity, in the same atomic commit.
 */
export async function rescheduleBooking(input: RescheduleInput): Promise<RescheduleResult> {
  const { token, newStartsAtIso } = input;

  const lookup = await sql<LookupRow>`
    SELECT b.id, b.event_type_id, b.status, b.starts_at, b.ends_at,
           et.duration_minutes, et.capacity, et.buffer_before_minutes,
           et.buffer_after_minutes, et.minimum_notice_minutes, et.booking_horizon_days,
           et.name AS event_name, et.slug AS event_slug,
           h.id AS host_id, h.timezone AS host_timezone, h.slug AS host_slug, h.name AS host_name
    FROM bookings b
    JOIN event_types et ON et.id = b.event_type_id
    JOIN hosts h ON h.id = et.host_id
    WHERE b.management_token = ${token}`;

  const row = lookup.rows[0];
  if (!row) {
    return { statusCode: 404, body: { error: "Booking not found", code: "booking_not_found" } };
  }
  if (row.status !== "confirmed") {
    return {
      statusCode: 409,
      body: { error: `Only confirmed bookings can be rescheduled (current: ${row.status})`, code: "not_reschedulable" },
    };
  }

  const eventType: EventType = {
    id: row.event_type_id,
    host_id: row.host_id,
    name: row.event_name,
    slug: row.event_slug,
    duration_minutes: row.duration_minutes,
    capacity: row.capacity,
    buffer_before_minutes: row.buffer_before_minutes,
    buffer_after_minutes: row.buffer_after_minutes,
    minimum_notice_minutes: row.minimum_notice_minutes,
    booking_horizon_days: row.booking_horizon_days,
    created_at: new Date(0),
    updated_at: new Date(0),
  };

  const weekly = await getWeeklyAvailability(row.host_id);
  const overrides = await getOverrides(row.host_id);
  const previousStartsAtIso = new Date(row.starts_at).toISOString();

  return withTransaction(async (client) => {
    const sql = sqlFor(client);

    // 1. Lock the NEW slot's capacity window.
    await lockSlot(client, eventType.id, newStartsAtIso);

    // 2. Lock the booking row and re-check status under the lock.
    const bRows = await sql<Booking>`SELECT * FROM bookings WHERE id = ${row.id} FOR UPDATE`;
    const booking = bRows.rows[0]!;
    if (booking.status !== "confirmed") {
      return { statusCode: 409, body: { error: "Booking is no longer confirmed", code: "not_reschedulable" } };
    }

    // 3. Authoritative now + slot validation.
    const nowRow = await sql<{ now: Date }>`SELECT now()`;
    const dbNow = DateTime.fromJSDate(nowRow.rows[0]!.now, { zone: "UTC" });
    if (!isValidSlotPlacement(eventType, row.host_timezone, weekly, overrides, newStartsAtIso, dbNow)) {
      return { statusCode: 422, body: { error: "Requested slot is not available", code: "invalid_slot" } };
    }

    // 4. Expire stale holds at the new slot, then count active EXCLUDING this booking.
    await sql`UPDATE bookings SET status = 'expired', updated_at = now()
      WHERE event_type_id = ${eventType.id} AND starts_at = ${newStartsAtIso}
        AND status = 'held' AND hold_expires_at <= now()`;
    const countRow = await sql<{ count: string }>`SELECT count(*)::text AS count FROM bookings
      WHERE event_type_id = ${eventType.id} AND starts_at = ${newStartsAtIso}
        AND status IN ('held', 'confirmed') AND id <> ${row.id}`;
    if (Number(countRow.rows[0]!.count) >= eventType.capacity) {
      return { statusCode: 409, body: { error: "Target slot is at capacity", code: "capacity_full" } };
    }

    // 5. Move atomically in place. Identity and management token are preserved.
    const endsAtIso = DateTime.fromISO(newStartsAtIso, { zone: "UTC" })
      .plus({ minutes: eventType.duration_minutes })
      .toISO()!;
    const upd = await sql<Booking>`
      UPDATE bookings SET starts_at = ${newStartsAtIso}, ends_at = ${endsAtIso}, updated_at = now()
      WHERE id = ${row.id} RETURNING *`;
    const moved = upd.rows[0]!;

    // 6. Outbox event with the previous start for an audit trail.
    await recordNotification(client, moved, "booking.rescheduled", { previous_starts_at: previousStartsAtIso });

    inc(METRICS.bookingsRescheduled);
    return { statusCode: 200, body: bookingDto(moved) };
  });
}
