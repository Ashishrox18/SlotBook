import { DateTime } from "luxon";
import { sql, pool } from "../lib/db";

/**
 * Idempotent seed: the demo host "Alex Morgan" (America/New_York), two event
 * types (capacity 1 and capacity 5), Mon-Fri weekly availability with two
 * windows per day, plus a day-off override and a custom-hours override.
 *
 * Override dates are computed relative to today in the host timezone so the
 * dashboard always has something current to show.
 */
async function main() {
  const tz = "America/New_York";

  const host = await sql<{ id: string }>`
    INSERT INTO hosts (slug, name, timezone)
    VALUES ('alex-morgan', 'Alex Morgan', ${tz})
    ON CONFLICT (slug) DO UPDATE
      SET name = EXCLUDED.name, timezone = EXCLUDED.timezone, updated_at = now()
    RETURNING id`;
  const hostId = host.rows[0]!.id;

  const intro = await sql<{ id: string }>`
    INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity,
      buffer_before_minutes, buffer_after_minutes, minimum_notice_minutes, booking_horizon_days)
    VALUES (${hostId}, '15-Minute Introduction', 'intro-15', 15, 1, 5, 5, 120, 30)
    ON CONFLICT (host_id, slug) DO UPDATE SET
      name = EXCLUDED.name, duration_minutes = EXCLUDED.duration_minutes,
      capacity = EXCLUDED.capacity, buffer_before_minutes = EXCLUDED.buffer_before_minutes,
      buffer_after_minutes = EXCLUDED.buffer_after_minutes,
      minimum_notice_minutes = EXCLUDED.minimum_notice_minutes,
      booking_horizon_days = EXCLUDED.booking_horizon_days, updated_at = now()
    RETURNING id`;
  const introId = intro.rows[0]!.id;

  await sql`
    INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity,
      buffer_before_minutes, buffer_after_minutes, minimum_notice_minutes, booking_horizon_days)
    VALUES (${hostId}, 'Product Office Hours', 'office-hours', 60, 5, 10, 15, 180, 60)
    ON CONFLICT (host_id, slug) DO UPDATE SET
      name = EXCLUDED.name, duration_minutes = EXCLUDED.duration_minutes,
      capacity = EXCLUDED.capacity, buffer_before_minutes = EXCLUDED.buffer_before_minutes,
      buffer_after_minutes = EXCLUDED.buffer_after_minutes,
      minimum_notice_minutes = EXCLUDED.minimum_notice_minutes,
      booking_horizon_days = EXCLUDED.booking_horizon_days, updated_at = now()`;

  // Weekly availability: Mon-Fri, two windows per day (host local wall clock).
  await sql`DELETE FROM weekly_availability WHERE host_id = ${hostId}`;
  const windows: Array<[number, string, string]> = [
    [1, "09:00", "12:00"],
    [1, "13:00", "17:00"],
    [2, "09:00", "12:00"],
    [2, "13:00", "17:00"],
    [3, "09:00", "12:00"],
    [3, "13:00", "17:00"],
    [4, "09:00", "12:00"],
    [4, "13:00", "17:00"],
    [5, "09:00", "12:00"],
    [5, "13:00", "17:00"],
  ];
  for (const [weekday, start, end] of windows) {
    await sql`INSERT INTO weekly_availability (host_id, weekday, start_local_time, end_local_time)
      VALUES (${hostId}, ${weekday}, ${start}, ${end})`;
  }

  // Overrides relative to "today" in the host timezone.
  const today = DateTime.now().setZone(tz).startOf("day");
  const dayOffDate = today.plus({ days: 6 }).toISODate()!;
  const customDate = today.plus({ days: 9 }).toISODate()!;

  await sql`DELETE FROM availability_overrides WHERE host_id = ${hostId}`;
  await sql`INSERT INTO availability_overrides (host_id, local_date, override_type)
    VALUES (${hostId}, ${dayOffDate}, 'day_off')`;
  await sql`INSERT INTO availability_overrides (host_id, local_date, override_type, start_local_time, end_local_time)
    VALUES (${hostId}, ${customDate}, 'custom_hours', '10:00', '14:00')`;

  // Demo booking notification events feed starts empty; nothing to insert.

  console.log("[seed] demo host ready");
  console.log("      Public booking:  http://localhost:3000/alex-morgan/intro-15");
  console.log("      Public booking:  http://localhost:3000/alex-morgan/office-hours");
  console.log("      Dashboard:       http://localhost:3000/dashboard/login");
  console.log(`      Host id: ${hostId}`);
  console.log(`      Intro id: ${introId}`);
  console.log(`      Day off:  ${dayOffDate}  Custom hours: ${customDate}`);
}

main()
  .catch((err) => {
    console.error("[seed] failed", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
