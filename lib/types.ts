// Shared row types matching the SQL schema. pg returns timestamptz as Date,
// `time` as "HH:MM:SS", `date` as "YYYY-MM-DD", and jsonb as parsed objects.

export interface Host {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  created_at: Date;
  updated_at: Date;
}

export interface EventType {
  id: string;
  host_id: string;
  name: string;
  slug: string;
  duration_minutes: number;
  capacity: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_minutes: number;
  booking_horizon_days: number;
  created_at: Date;
  updated_at: Date;
}

export interface WeeklyWindow {
  id: string;
  host_id: string;
  weekday: number; // 0=Sun .. 6=Sat
  start_local_time: string; // "HH:MM:SS"
  end_local_time: string; // "HH:MM:SS"
}

export type OverrideType = "day_off" | "custom_hours";

export interface OverrideRow {
  id: string;
  host_id: string;
  local_date: string; // "YYYY-MM-DD"
  override_type: OverrideType;
  start_local_time: string | null;
  end_local_time: string | null;
}

export type BookingStatus = "held" | "confirmed" | "cancelled" | "expired";

export interface Booking {
  id: string;
  event_type_id: string;
  starts_at: Date;
  ends_at: Date;
  status: BookingStatus;
  hold_expires_at: Date | null;
  guest_name: string | null;
  guest_email: string | null;
  management_token: string | null;
  cancellation_reason: string | null;
  created_by_ip: string | null;
  created_at: Date;
  updated_at: Date;
}

export type NotificationEventType =
  | "booking.confirmed"
  | "booking.rescheduled"
  | "booking.cancelled";

export interface NotificationEventRow {
  id: string;
  booking_id: string;
  event_type: NotificationEventType;
  payload: Record<string, unknown>;
  status: "pending" | "processed" | "failed";
  created_at: Date;
  processed_at: Date | null;
}

// A slot as returned to clients. Times are ISO strings in the viewer timezone.
export interface SlotDTO {
  starts_at: string; // ISO8601 UTC (authoritative)
  starts_at_local: string; // wall-clock in viewer tz
  end_at_local: string;
  available: boolean;
  remaining_capacity: number;
}
