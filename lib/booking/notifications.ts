import type { PoolClient } from "pg";
import { sqlFor } from "../db";
import { inc, METRICS } from "../observability/metrics";
import type { Booking, NotificationEventType } from "../types";

/**
 * Transactional outbox. Notification events are written in the SAME transaction
 * as the booking lifecycle change, so they are durably recorded exactly when the
 * state transition commits — never before, and never lost if the transition
 * rolls back. A notification is "recorded" by virtue of the committed row.
 *
 * No external provider is called here. A real processor would drain the outbox
 * out-of-band; for the demo, the /notifications page surfaces committed events.
 */
export async function recordNotification(
  client: PoolClient,
  booking: Booking,
  eventType: NotificationEventType,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const sql = sqlFor(client);
  const payload = {
    event_type: eventType,
    booking_id: booking.id,
    event_type_id: booking.event_type_id,
    starts_at: booking.starts_at,
    ends_at: booking.ends_at,
    guest_name: booking.guest_name,
    guest_email: booking.guest_email,
    occurred_at: new Date().toISOString(),
    ...extra,
  };
  const payloadStr = JSON.stringify(payload);
  await sql`INSERT INTO notification_events (booking_id, event_type, payload)
    VALUES (${booking.id}, ${eventType}, ${payloadStr}::jsonb)`;
  inc(METRICS.notificationsCreated);
}
