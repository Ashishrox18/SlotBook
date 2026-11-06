import { DateTime } from "luxon";
import type { EventType, Host, OverrideRow, SlotDTO, WeeklyWindow } from "../types";
import { effectiveWindowsForDate, localToUtc } from "../time";

/**
 * Slot generation. This module is the single source of truth for "which start
 * times are valid for this event". Both the public slots endpoint and the hold
 * creation path reuse it, so a guest can only ever hold a slot the engine would
 * actually show.
 *
 * Generation applies, in order:
 *   1. Effective availability (overrides override weekly) for the host-local date
 *   2. Duration + buffers (slots never overlap, including their buffers)
 *   3. Minimum notice (relative to authoritative DB `now`)
 *   4. Booking horizon (host-local calendar days)
 *
 * Capacity is NOT applied here — it is enforced in Postgres at hold time.
 */

export interface SlotInstant {
  startsAt: DateTime; // UTC
  endsAt: DateTime; // UTC
}

/**
 * Generate valid slot instants for a single host-local date.
 * Returns UTC DateTimes. No capacity filtering.
 */
export function generateSlotsForDate(
  eventType: EventType,
  hostTz: string,
  dateIso: string,
  weekly: WeeklyWindow[],
  overrides: OverrideRow[],
  now: DateTime, // UTC, authoritative
): SlotInstant[] {
  const eff = effectiveWindowsForDate(hostTz, dateIso, weekly, overrides);
  if (eff.type === "none") return [];

  const D = eventType.duration_minutes;
  const Bb = eventType.buffer_before_minutes;
  const Ba = eventType.buffer_after_minutes;
  const minNoticeMs = eventType.minimum_notice_minutes * 60_000;
  const todayHost = now.setZone(hostTz).startOf("day");
  const horizonEndUtc = todayHost
    .plus({ days: eventType.booking_horizon_days })
    .endOf("day")
    .toUTC();

  const out: SlotInstant[] = [];
  for (const w of eff.windows) {
    const wStart = localToUtc(hostTz, dateIso, w.start);
    const wEnd = localToUtc(hostTz, dateIso, w.end);
    const step = D + Ba + Bb; // non-overlapping even with buffers
    let start = wStart.plus({ minutes: Bb }); // first slot's buffer fits at window start
    while (start.plus({ minutes: D + Ba }).toMillis() <= wEnd.toMillis()) {
      if (start.toMillis() >= now.toMillis() + minNoticeMs && start.toMillis() <= horizonEndUtc.toMillis()) {
        out.push({ startsAt: start, endsAt: start.plus({ minutes: D }) });
      }
      start = start.plus({ minutes: step });
    }
  }
  return out;
}

export interface GenerateSlotsParams {
  host: Host;
  eventType: EventType;
  weekly: WeeklyWindow[];
  overrides: OverrideRow[];
  fromIso: string; // "YYYY-MM-DD" interpreted in host timezone
  toIso: string;
  now: DateTime; // UTC, authoritative
  viewerTz: string;
  activeBookings: Map<string, number>; // startsAtIso(UTC) -> active count
}

export function generateSlots(params: GenerateSlotsParams): SlotDTO[] {
  const { host, eventType, weekly, overrides, fromIso, toIso, now, viewerTz, activeBookings } = params;
  const hostTz = host.timezone;
  let cursor = DateTime.fromISO(fromIso, { zone: hostTz }).startOf("day");
  const end = DateTime.fromISO(toIso, { zone: hostTz }).startOf("day");

  const out: SlotDTO[] = [];
  while (cursor.toMillis() <= end.toMillis()) {
    const dateIso = cursor.toISODate()!;
    for (const s of generateSlotsForDate(eventType, hostTz, dateIso, weekly, overrides, now)) {
      const startsAtIso = s.startsAt.toISO()!;
      const count = activeBookings.get(startsAtIso) ?? 0;
      const remaining = Math.max(0, eventType.capacity - count);
      out.push({
        starts_at: startsAtIso,
        starts_at_local: s.startsAt.setZone(viewerTz).toFormat("yyyy-MM-dd HH:mm"),
        end_at_local: s.endsAt.setZone(viewerTz).toFormat("yyyy-MM-dd HH:mm"),
        available: remaining > 0,
        remaining_capacity: remaining,
      });
    }
    cursor = cursor.plus({ days: 1 });
  }
  out.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return out;
}

/**
 * Validate that a requested start instant is a slot the engine would generate.
 * This enforces availability, buffer alignment, minimum notice, and horizon in
 * one check. Capacity is checked separately at hold time.
 */
export function isValidSlotPlacement(
  eventType: EventType,
  hostTz: string,
  weekly: WeeklyWindow[],
  overrides: OverrideRow[],
  startsAtIso: string,
  now: DateTime,
): boolean {
  const start = DateTime.fromISO(startsAtIso, { zone: "UTC" });
  if (!start.isValid) return false;
  const dateIso = start.setZone(hostTz).toISODate()!;
  const slots = generateSlotsForDate(eventType, hostTz, dateIso, weekly, overrides, now);
  return slots.some((s) => s.startsAt.toISO() === startsAtIso);
}
