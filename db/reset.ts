import { sql, pool } from "../lib/db";

/** Drops all Slotbook tables and the migrations ledger. Use for a clean re-seed. */
async function main() {
  await sql`DROP TABLE IF EXISTS notification_events CASCADE`;
  await sql`DROP TABLE IF EXISTS idempotency_keys CASCADE`;
  await sql`DROP TABLE IF EXISTS bookings CASCADE`;
  await sql`DROP TABLE IF EXISTS availability_overrides CASCADE`;
  await sql`DROP TABLE IF EXISTS weekly_availability CASCADE`;
  await sql`DROP TABLE IF EXISTS event_types CASCADE`;
  await sql`DROP TABLE IF EXISTS hosts CASCADE`;
  await sql`DROP TABLE IF EXISTS schema_migrations CASCADE`;
  console.log("[reset] all tables dropped");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
