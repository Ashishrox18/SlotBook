import { DateTime } from "luxon";
import type { OverrideRow, WeeklyWindow } from "../types";

/**
 * Time helpers. Host availability is wall-clock time in the host's IANA zone.
 * We never compute offsets by hand — Luxon carries the IANA tz database, so
 * DST transitions are handled by interpreting "09:00 on <date> in <zone>".
 */

const UTC = "UTC";

/** 0=Sun..6=Sat (matches the schema). Luxon weekday is 1=Mon..7=Sun. */
export function weekdayDbFromIsoDate(dateIso: string): number {
  const wd = DateTime.fromISO(dateIso).weekday; // 1..7 (Mon..Sun)
  return wd % 7; // -> 0..6 (Sun..Sat)
}

/**
 * Resolve the effective availability windows for a host-local date.
 * Overrides take precedence over weekly availability:
 *  - day_off      -> no windows
 *  - custom_hours -> the override window(s)
 *  - otherwise    -> weekly windows for that weekday
 */
export function effectiveWindowsForDate(
  hostTz: string,
  dateIso: string,
  weekly: WeeklyWindow[],
  overrides: OverrideRow[],
): { type: "none" } | { type: "windows"; windows: { start: string; end: string }[] } {
  const override = overrides.find((o) => o.local_date === dateIso);
  if (override) {
    if (override.override_type === "day_off") return { type: "none" };
    return {
      type: "windows",
      windows: [{ start: override.start_local_time!, end: override.end_local_time! }],
    };
  }
  const wd = weekdayDbFromIsoDate(dateIso);
  const dayWindows = weekly
    .filter((w) => w.weekday === wd)
    .map((w) => ({ start: w.start_local_time, end: w.end_local_time }))
    .sort((a, b) => a.start.localeCompare(b.start));
  return { type: "windows", windows: dayWindows };
}

/**
 * Convert a host-local wall-clock time on a given local date to a UTC DateTime.
 * This is the DST-critical operation: "09:00 on 2024-03-09 in America/New_York"
 * resolves to a specific UTC instant using the offset valid on that date.
 */
export function localToUtc(
  hostTz: string,
  dateIso: string,
  localTime: string,
): DateTime {
  return DateTime.fromISO(`${dateIso}T${localTime}`, { zone: hostTz }).toUTC();
}

export function utcNow(): DateTime {
  return DateTime.utc();
}

export function toIso(date: Date | DateTime): string {
  return date instanceof DateTime ? date.toUTC().toISO()! : DateTime.fromJSDate(date, { zone: UTC }).toISO()!;
}

/** Format a UTC instant as a wall-clock string in the given zone, e.g. "2024-03-09 09:00". */
export function formatInZone(isoUtc: string, zone: string, fmt = "MMM d, yyyy h:mm a ZZZZ"): string {
  return DateTime.fromISO(isoUtc, { zone: UTC }).setZone(zone).toFormat(fmt);
}

/** Get a short zone label, e.g. "America/New_York (EST)". */
export function zoneLabel(zone: string, refIso?: string): string {
  const ref = refIso ? DateTime.fromISO(refIso, { zone: UTC }).setZone(zone) : DateTime.now().setZone(zone);
  const abbr = (ref.offsetNameShort ?? ref.offsetNameLong ?? zone) as string;
  return `${zone} (${abbr})`;
}

/** True if a string is a valid IANA zone. */
export function isValidZone(zone: string): boolean {
  try {
    return DateTime.local().setZone(zone).isValid;
  } catch {
    return false;
  }
}
