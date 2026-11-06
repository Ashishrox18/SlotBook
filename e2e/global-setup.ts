import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Minimal .env loader so the playwright process can reach the DB. */
function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

/**
 * Gives E2E a clean, deterministic starting point: keep the seeded host/event
 * types/availability, but wipe bookings + outbox so capacity is fresh.
 */
export default async function globalSetup() {
  loadEnv();
  const { pool, sql } = await import("../lib/db");
  try {
    await sql`TRUNCATE TABLE notification_events, idempotency_keys, bookings RESTART IDENTITY CASCADE`;
    // Idempotently (re)assert the seed host and event types.
    const host = await sql<{ id: string }>`INSERT INTO hosts (slug, name, timezone)
      VALUES ('alex-morgan', 'Alex Morgan', 'America/New_York')
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now() RETURNING id`;
    const hostId = host.rows[0]!.id;
    await sql`INSERT INTO event_types (host_id, name, slug, duration_minutes, capacity,
        buffer_before_minutes, buffer_after_minutes, minimum_notice_minutes, booking_horizon_days)
      VALUES (${hostId}, '15-Minute Introduction', 'intro-15', 15, 1, 5, 5, 120, 30),
             (${hostId}, 'Product Office Hours', 'office-hours', 60, 5, 10, 15, 180, 60)
      ON CONFLICT (host_id, slug) DO UPDATE SET updated_at = now()`;
    console.log("[e2e] database reset + reseeded");
  } finally {
    await pool.end();
  }
}
