import { sqlFor, withTransaction } from "../db";
import { recordNotification } from "./notifications";
import { bookingDto } from "./dto";
import { inc, METRICS } from "../observability/metrics";
import { assertTransition } from "./state-machine";
import type { Booking } from "../types";

export interface CancelInput {
  token: string;
  reason: string;
}

export interface CancelResult {
  statusCode: number;
  body: unknown;
}

/**
 * Cancel a confirmed booking. Atomic transition; the booking stops consuming
 * capacity immediately (it is excluded from active counts by status), the
 * reason is persisted, and a booking.cancelled outbox event is written in the
 * same transaction. Idempotent if already cancelled.
 */
export async function cancelBooking(input: CancelInput): Promise<CancelResult> {
  const { token, reason } = input;

  return withTransaction(async (client) => {
    const sql = sqlFor(client);

    const rows = await sql<Booking>`SELECT * FROM bookings WHERE management_token = ${token} FOR UPDATE`;
    const booking = rows.rows[0];

    if (!booking) {
      return { statusCode: 404, body: { error: "Booking not found", code: "booking_not_found" } };
    }

    if (booking.status === "cancelled") {
      return { statusCode: 200, body: bookingDto(booking) };
    }

    if (!["confirmed", "held"].includes(booking.status)) {
      return {
        statusCode: 409,
        body: {
          error: `Only confirmed or held bookings can be cancelled (current: ${booking.status})`,
          code: "not_cancellable",
        },
      };
    }
    assertTransition(booking.status, "cancelled");

    const upd = await sql<Booking>`
      UPDATE bookings SET status = 'cancelled', cancellation_reason = ${reason}, updated_at = now()
      WHERE id = ${booking.id} RETURNING *`;
    const cancelled = upd.rows[0]!;

    await recordNotification(client, cancelled, "booking.cancelled", { cancellation_reason: reason });

    inc(METRICS.bookingsCancelled);
    return { statusCode: 200, body: bookingDto(cancelled) };
  });
}
