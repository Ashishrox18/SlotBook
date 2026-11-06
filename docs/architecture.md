# Architecture

## Overview

```
Guest / Host Browser
        │
        ▼
  Next.js 14 App Router (app/)
  ├── Public pages   ([host]/[slug], /bookings/[token], /notifications, /reliability)
  ├── Dashboard pages (app/dashboard/*)
  └── API Routes     (app/api/*)
        │
        ▼
  Booking / Availability Engine (lib/)
  ├── lib/availability/   – slot generation, availability queries
  ├── lib/booking/        – holds, confirm, cancel, reschedule, notifications
  ├── lib/time/           – Luxon DST-aware conversions
  ├── lib/idempotency/    – request hash + replay
  ├── lib/security/       – auth, rate limit
  └── lib/observability/  – logger, metrics, http helpers
        │
        ▼
  PostgreSQL 15
  ├── hosts
  ├── event_types
  ├── weekly_availability
  ├── availability_overrides
  ├── bookings           ← source of truth for capacity
  ├── idempotency_keys
  └── notification_events (outbox)
```

## Key Design Decisions

### 1. PostgreSQL is the Source of Truth

All correctness-critical decisions (capacity counts, hold expiry, idempotency) happen inside Postgres transactions. The application server is stateless with respect to correctness. If you restart the app, or run 10 app replicas, bookings remain correct.

### 2. Per-Slot Advisory Locks

`pg_advisory_xact_lock(hashtext(event_type_id), hashtext(starts_at))` serializes concurrent hold creation for the same slot. See `docs/booking-correctness.md`.

### 3. Authoritative Server Time

`SELECT now()` inside the same transaction as any hold/expiry decision. Client clocks are never trusted for expiry, notice, or horizon checks.

### 4. Transactional Outbox

`notification_events` rows are inserted in the **same transaction** as the booking lifecycle change. If the change rolls back, the notification is never created. If the change commits, the notification is guaranteed to exist. No event fan-out happens until the row is committed.

### 5. Idempotency

Hold creation caches the successful response in `idempotency_keys`. The same `(Idempotency-Key, request_hash)` replays the committed hold. A different request on the same key returns 409. TTL is 24 hours.

### 6. Atomic Reschedule

The booking row is updated in place (`UPDATE bookings SET starts_at = new_slot`) — it is never cancelled and re-created. The new slot's advisory lock is acquired before the capacity check, so the move is safe under concurrency.

## Data Flow: Hold Creation

```
POST /api/holds
  │ Zod validation + rate limit check
  ▼
createHold()
  │ pg_advisory_xact_lock(event_type_id, starts_at)    ← serializes concurrent requests
  │ Check idempotency_keys (replay or conflict)
  │ SELECT now()                                        ← authoritative time
  │ isValidSlotPlacement() (availability + notice + horizon)
  │ UPDATE bookings SET status='expired' WHERE ...     ← lazy expiry
  │ SELECT count(*) WHERE status IN ('held','confirmed')← safe inside lock
  │ INSERT INTO bookings (status='held', hold_expires_at)
  │ INSERT INTO idempotency_keys
  └─ COMMIT
```
