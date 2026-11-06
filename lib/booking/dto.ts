import type { Booking } from "../types";

/** Map a booking row to a client-safe DTO. Management tokens are never included
 *  here; callers add the token explicitly only where it must be returned. */
export function bookingDto(b: Booking) {
  return {
    id: b.id,
    event_type_id: b.event_type_id,
    starts_at: new Date(b.starts_at).toISOString(),
    ends_at: new Date(b.ends_at).toISOString(),
    status: b.status,
    hold_expires_at: b.hold_expires_at ? new Date(b.hold_expires_at).toISOString() : null,
    guest_name: b.guest_name,
    guest_email: b.guest_email,
    cancellation_reason: b.cancellation_reason,
    created_at: new Date(b.created_at).toISOString(),
    updated_at: new Date(b.updated_at).toISOString(),
  };
}
