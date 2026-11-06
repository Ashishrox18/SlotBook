import { DateTime } from "luxon";
import { sqlFor, withTransaction } from "../db";
import {
  getEventHost,
  getEventTypeById,
  getOverrides,
  getWeeklyAvailability,
} from "../availability/queries";
import { isValidSlotPlacement } from "../availability/slots";
import { hashRequest } from "../idempotency";
import { lockSlot } from "./locks";
import { inc, METRICS } from "../observability/metrics";

export interface HoldDTO {
  id: string;
  event_type_id: string;
  starts_at: string;
  ends_at: string;
  status: "held";
  hold_expires_at: string;
}

export interface HoldResult {
  statusCode: number;
  body: unknown;
}

interface IdempotencyRow {
  request_hash: string;
  response_payload: Record<string, unknown>;
  status_code: number;
  expires_at: Date;
}

const HOLD_TTL_MINUTES = 5;
/** Abuse protection: max simultaneous unexpired holds per (IP, event). */
const MAX_ACTIVE_HOLDS_PER_IP_EVENT = 5;

export interface CreateHoldInput {
  idempotencyKey: string;
  eventTypeId: string;
  startsAtIso: string;
  ip?: string | null;
}

/**
 * Create a hold. See docs/booking-correctness.md for the full rationale.
 *
 * One transaction, two guarantees:
 *  - Deterministic per-slot advisory lock serializes concurrent attempts for
 *    the same slot, so expire -> count -> insert is race-free.
 *  - Idempotency: same (key, request) replays the committed 201; same key with a
 *    different request is a 409. Only successful holds are cached so a later
 *    freed-up slot is not masked by a stale failure record.
 */
export async function createHold(input: CreateHoldInput): Promise<HoldResult> {
  const { idempotencyKey, eventTypeId, startsAtIso, ip } = input;
  const requestHash = hashRequest({ event_type_id: eventTypeId, starts_at: startsAtIso });

  const eventType = await getEventTypeById(eventTypeId);
  if (!eventType) {
    return { statusCode: 404, body: { error: "Event type not found", code: "event_not_found" } };
  }
  const host = await getEventHost(eventType);
  if (!host) {
    return { statusCode: 404, body: { error: "Host not found", code: "host_not_found" } };
  }
  const weekly = await getWeeklyAvailability(host.id);
  const overrides = await getOverrides(host.id);

  return withTransaction(async (client) => {
    const sql = sqlFor(client);

    // 1. Serialize concurrent hold attempts for THIS slot.
    await lockSlot(client, eventTypeId, startsAtIso);

    // 2. Idempotency replay: only successes are cached, so a replayed key returns
    //    the exact committed hold. A key reused with a different body conflicts.
    const idem = await sql<IdempotencyRow>`SELECT request_hash, response_payload, status_code, expires_at
      FROM idempotency_keys WHERE key = ${idempotencyKey}`;
    if (idem.rows.length) {
      const row = idem.rows[0]!;
      if (row.request_hash !== requestHash) {
        return {
          statusCode: 409,
          body: { error: "Idempotency-Key already used with a different request body", code: "idempotency_conflict" },
        };
      }
      if (new Date(row.expires_at) > new Date()) {
        return { statusCode: row.status_code, body: row.response_payload };
      }
      await sql`DELETE FROM idempotency_keys WHERE key = ${idempotencyKey}`;
    }

    // 2b. Abuse protection (NOT a correctness mechanism): cap concurrent unexpired
    //     holds per IP/event so one client cannot hoard every slot. Capacity
    //     correctness still lives entirely in the per-slot advisory lock below.
    if (ip) {
      const ipCount = await sql<{ count: string }>`SELECT count(*)::text AS count FROM bookings
        WHERE event_type_id = ${eventTypeId} AND created_by_ip = ${ip}
          AND status = 'held' AND hold_expires_at > now()`;
      if (Number(ipCount.rows[0]!.count) >= MAX_ACTIVE_HOLDS_PER_IP_EVENT) {
        return {
          statusCode: 429,
          body: { error: "Too many active holds for this event from your address", code: "too_many_holds" },
        };
      }
    }

    // 3. Authoritative DB time for notice/horizon/hold-expiry decisions.
    const nowRow = await sql<{ now: Date }>`SELECT now()`;
    const dbNow = DateTime.fromJSDate(nowRow.rows[0]!.now, { zone: "UTC" });

    // 4. The requested start must be a slot the engine would generate (availability,
    //    buffers, minimum notice, horizon all enforced here).
    if (!isValidSlotPlacement(eventType, host.timezone, weekly, overrides, startsAtIso, dbNow)) {
      return { statusCode: 422, body: { error: "Requested slot is not available", code: "invalid_slot" } };
    }

    // 5. Lazily expire stale holds for this slot using DB time, so they stop
    //    consuming capacity before we count.
    const expiredRes = await sql`UPDATE bookings SET status = 'expired', updated_at = now()
      WHERE event_type_id = ${eventTypeId} AND starts_at = ${startsAtIso}
        AND status = 'held' AND hold_expires_at <= now()`;
    if (expiredRes.rowCount && expiredRes.rowCount > 0) inc(METRICS.holdsExpired, expiredRes.rowCount);

    // 6. Count active bookings for this exact slot. Safe because we hold the
    //    per-slot advisory lock — no concurrent insert can slip between this
    //    SELECT and the INSERT below.
    const countRow = await sql<{ count: string }>`SELECT count(*)::text AS count FROM bookings
      WHERE event_type_id = ${eventTypeId} AND starts_at = ${startsAtIso}
        AND status IN ('held', 'confirmed')`;
    const activeCount = Number(countRow.rows[0]!.count);

    if (activeCount >= eventType.capacity) {
      return {
        statusCode: 409,
        body: {
          error: "Slot is at capacity",
          code: "capacity_full",
          capacity: eventType.capacity,
          active: activeCount,
        },
      };
    }

    // 7. Create the hold. Hold expiry is derived from the authoritative DB now.
    const endsAtIso = DateTime.fromISO(startsAtIso, { zone: "UTC" })
      .plus({ minutes: eventType.duration_minutes })
      .toISO()!;
    const holdExpiresAtIso = dbNow.plus({ minutes: HOLD_TTL_MINUTES }).toISO()!;
    const holdRow = await sql<{ id: string; hold_expires_at: Date }>`
      INSERT INTO bookings (event_type_id, starts_at, ends_at, status, hold_expires_at, created_by_ip)
      VALUES (${eventTypeId}, ${startsAtIso}, ${endsAtIso}, 'held', ${holdExpiresAtIso}, ${ip ?? null})
      RETURNING id, hold_expires_at`;
    const hold = holdRow.rows[0]!;

    const dto: HoldDTO = {
      id: hold.id,
      event_type_id: eventTypeId,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      status: "held",
      hold_expires_at: new Date(hold.hold_expires_at).toISOString(),
    };

    // 8. Cache the successful result so retries with the same key replay it.
    const payloadStr = JSON.stringify(dto);
    await sql`INSERT INTO idempotency_keys (key, request_hash, response_payload, status_code, expires_at)
      VALUES (${idempotencyKey}, ${requestHash}, ${payloadStr}::jsonb, 201, now() + interval '24 hours')`;

    inc(METRICS.holdsCreated);
    return { statusCode: 201, body: dto };
  });
}
