import { randomBytes } from "node:crypto";
import { sqlFor, withTransaction } from "../db";
import { recordNotification } from "./notifications";
import { bookingDto } from "./dto";
import { inc, METRICS } from "../observability/metrics";
import { assertTransition } from "./state-machine";
import type { Booking } from "../types";

export interface ConfirmInput {
  holdId: string;
  guestName: string;
  guestEmail: string;
}

export interface ConfirmResult {
  statusCode: number;
  body: unknown;
}

/**
 * Confirm a hold. Confirms are idempotent: a duplicate request against an
 * already-confirmed booking returns the same booking instead of an error, so
 * a lost browser response / retry never double-charges the slot.
 *
 * Expiry is checked with authoritative DB time; an expired hold is marked
 * 'expired' and never confirmed.
 */
export async function confirmHold(input: ConfirmInput): Promise<ConfirmResult> {
  const { holdId, guestName, guestEmail } = input;

  return withTransaction(async (client) => {
    const sql = sqlFor(client);

    const rows = await sql<Booking>`
      SELECT b.* FROM bookings b WHERE b.id = ${holdId} FOR UPDATE OF b`;
    const hold = rows.rows[0];

    if (!hold) {
      return { statusCode: 404, body: { error: "Hold not found", code: "hold_not_found" } };
    }

    // Idempotent: a retried confirm returns the already-confirmed booking.
    if (hold.status === "confirmed") {
      return { statusCode: 200, body: bookingDto(hold) };
    }

    if (hold.status === "cancelled" || hold.status === "expired") {
      return {
        statusCode: 409,
        body: { error: `Hold is ${hold.status}`, code: `hold_${hold.status}` },
      };
    }

    // status === 'held': check expiry against authoritative DB time.
    const nowRow = await sql<{ now: Date }>`SELECT now()`;
    const dbNow = nowRow.rows[0]!.now;
    if (hold.hold_expires_at && new Date(hold.hold_expires_at) <= dbNow) {
      await sql`UPDATE bookings SET status = 'expired', updated_at = now() WHERE id = ${holdId}`;
      inc(METRICS.holdsExpired);
      return { statusCode: 410, body: { error: "Hold has expired", code: "hold_expired" } };
    }

    assertTransition(hold.status, "confirmed");
    const token = randomBytes(32).toString("hex");
    const upd = await sql<Booking>`
      UPDATE bookings
      SET status = 'confirmed', guest_name = ${guestName}, guest_email = ${guestEmail},
          management_token = ${token}, updated_at = now()
      WHERE id = ${holdId} RETURNING *`;
    const booking = upd.rows[0]!;

    // Notification outbox: written in the same transaction as the transition.
    await recordNotification(client, booking, "booking.confirmed");

    inc(METRICS.bookingsConfirmed);
    return {
      statusCode: 200,
      body: { ...bookingDto(booking), management_token: token, management_url: `/bookings/${token}` },
    };
  });
}
