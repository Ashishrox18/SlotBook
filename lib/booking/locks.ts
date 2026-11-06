import type { PoolClient } from "pg";
import { sqlFor } from "../db";

/**
 * Concurrency strategy: a PostgreSQL transaction-level advisory lock keyed
 * deterministically by (event_type_id, slot start). See docs/booking-correctness.md.
 *
 * `pg_advisory_xact_lock` is held until the transaction commits or rolls back,
 * so two hold attempts for the SAME slot are serialized. Different slots are
 * not serialized and can proceed in parallel. A hash collision would only
 * reduce parallelism, never break correctness.
 *
 * This lock is what makes the "expire stale holds -> count active -> insert"
 * sequence safe: the count-then-insert window is guarded per slot.
 */
export async function lockSlot(
  client: PoolClient,
  eventTypeId: string,
  startsAtIso: string,
): Promise<void> {
  const sql = sqlFor(client);
  await sql`SELECT pg_advisory_xact_lock(hashtext(${eventTypeId}), hashtext(${startsAtIso}))`;
}
