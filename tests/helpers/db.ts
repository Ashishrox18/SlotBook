import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pool, sql } from "@/lib/db";

const INIT_SQL = readFileSync(resolve(process.cwd(), "db/migrations/0001_init.sql"), "utf8");

/** Create the schema if it does not already exist (idempotent). */
export async function ensureSchema() {
  const res = await sql<{ exists: string | null }>`SELECT to_regclass('public.hosts') AS exists`;
  if (!res.rows[0]?.exists) {
    await pool.query(INIT_SQL);
  }
}

/** Wipe all Slotbook tables for test isolation. */
export async function truncateAll() {
  await sql`TRUNCATE TABLE notification_events, idempotency_keys, bookings,
    availability_overrides, weekly_availability, event_types, hosts RESTART IDENTITY CASCADE`;
}

export { pool, sql };
