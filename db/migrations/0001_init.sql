-- Slotbook initial schema.
-- PostgreSQL 15+. All instants are timestamptz. Server/DB time is authoritative.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- hosts
-- ---------------------------------------------------------------------------
CREATE TABLE hosts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  timezone    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- event_types
-- ---------------------------------------------------------------------------
CREATE TABLE event_types (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id                uuid NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  name                   text NOT NULL,
  slug                   text NOT NULL,
  duration_minutes       integer NOT NULL,
  capacity               integer NOT NULL,
  buffer_before_minutes  integer NOT NULL DEFAULT 0,
  buffer_after_minutes   integer NOT NULL DEFAULT 0,
  minimum_notice_minutes integer NOT NULL DEFAULT 0,
  booking_horizon_days   integer NOT NULL DEFAULT 60,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (host_id, slug),
  CONSTRAINT et_duration_range   CHECK (duration_minutes BETWEEN 15 AND 120),
  CONSTRAINT et_capacity_min     CHECK (capacity >= 1),
  CONSTRAINT et_buffer_before    CHECK (buffer_before_minutes  BETWEEN 0 AND 30),
  CONSTRAINT et_buffer_after     CHECK (buffer_after_minutes   BETWEEN 0 AND 30),
  CONSTRAINT et_notice_min       CHECK (minimum_notice_minutes >= 0),
  CONSTRAINT et_horizon_min      CHECK (booking_horizon_days >= 1)
);

CREATE INDEX event_types_host_idx ON event_types(host_id);

-- ---------------------------------------------------------------------------
-- weekly_availability  (multiple windows per weekday, host-local wall clock)
-- ---------------------------------------------------------------------------
CREATE TABLE weekly_availability (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id           uuid NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  weekday           smallint NOT NULL, -- 0=Sun ... 6=Sat
  start_local_time  time NOT NULL,
  end_local_time    time NOT NULL,
  CONSTRAINT wa_weekday_range CHECK (weekday BETWEEN 0 AND 6),
  CONSTRAINT wa_window_order  CHECK (end_local_time > start_local_time)
);

CREATE INDEX weekly_availability_host_idx ON weekly_availability(host_id, weekday);

-- ---------------------------------------------------------------------------
-- availability_overrides (day_off | custom_hours). Precedence over weekly.
-- ---------------------------------------------------------------------------
CREATE TABLE availability_overrides (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id           uuid NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  local_date        date NOT NULL,
  override_type     text NOT NULL,
  start_local_time  time,
  end_local_time    time,
  UNIQUE (host_id, local_date),
  CONSTRAINT ao_type_check CHECK (override_type IN ('day_off', 'custom_hours')),
  CONSTRAINT ao_custom_requires_times CHECK (
    override_type <> 'custom_hours' OR
    (start_local_time IS NOT NULL AND end_local_time IS NOT NULL AND end_local_time > start_local_time)
  )
);

CREATE INDEX availability_overrides_host_idx ON availability_overrides(host_id, local_date);

-- ---------------------------------------------------------------------------
-- bookings  (lifecycle: held -> confirmed | expired | cancelled)
-- ---------------------------------------------------------------------------
CREATE TABLE bookings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type_id      uuid NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
  starts_at          timestamptz NOT NULL,
  ends_at            timestamptz NOT NULL,
  status             text NOT NULL DEFAULT 'held',
  hold_expires_at    timestamptz,
  guest_name         text,
  guest_email        text,
  management_token   text,
  cancellation_reason text,
  created_by_ip       text, -- abuse protection only; never exposed in DTOs
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bk_status_check CHECK (status IN ('held', 'confirmed', 'cancelled', 'expired')),
  CONSTRAINT bk_window_order CHECK (ends_at > starts_at),
  CONSTRAINT bk_held_has_hold_expiry CHECK (
    status <> 'held' OR hold_expires_at IS NOT NULL
  )
);

-- Hot path for capacity checks: active bookings for a given event/slot.
CREATE INDEX bookings_capacity_idx ON bookings(event_type_id, starts_at)
  WHERE status IN ('held', 'confirmed');
CREATE INDEX bookings_status_idx ON bookings(status);
-- Management tokens are unguessable and unique when present.
CREATE UNIQUE INDEX bookings_management_token_uq ON bookings(management_token)
  WHERE management_token IS NOT NULL;
-- Abuse protection: active holds per IP/event.
CREATE INDEX bookings_ip_active_idx ON bookings(event_type_id, created_by_ip, status)
  WHERE status = 'held';

-- ---------------------------------------------------------------------------
-- idempotency_keys (durable retry cache for hold creation)
-- ---------------------------------------------------------------------------
CREATE TABLE idempotency_keys (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key              text NOT NULL UNIQUE,
  request_hash     text NOT NULL,
  response_payload jsonb NOT NULL,
  status_code      integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL
);

CREATE INDEX idempotency_expires_idx ON idempotency_keys(expires_at);

-- ---------------------------------------------------------------------------
-- notification_events  (transactional outbox)
-- ---------------------------------------------------------------------------
CREATE TABLE notification_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT ne_event_type_check CHECK (
    event_type IN ('booking.confirmed', 'booking.rescheduled', 'booking.cancelled')
  ),
  CONSTRAINT ne_status_check CHECK (status IN ('pending', 'processed', 'failed'))
);

CREATE INDEX notification_events_status_idx ON notification_events(status, created_at);
CREATE INDEX notification_events_booking_idx ON notification_events(booking_id);

-- ---------------------------------------------------------------------------
-- schema_migrations (migration bookkeeping)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
