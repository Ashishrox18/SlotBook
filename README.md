# Slotbook

A scheduling platform where the hard part is **correctness**, not the calendar.

> PostgreSQL is the source of truth. Holds, capacity, expiry, rescheduling, and notifications are all enforced in database transactions — a slot is never overbooked, even under concurrent requests, retries, or network failures.

---

## 60-Second Demo

```bash
# 1. Start everything
docker compose up --build

# 2. Book a slot (capacity 1)
open http://localhost:3000/alex-morgan/intro-15

# 3. Book an office hours slot (capacity 5)
open http://localhost:3000/alex-morgan/office-hours

# 4. Host dashboard (password: slotbook-demo)
open http://localhost:3000/dashboard/login

# 5. Notification outbox
open http://localhost:3000/notifications

# 6. Reliability + engineering transparency
open http://localhost:3000/reliability
```

---

## Architecture

```
Guest / Host Browser
        │
        ▼
  Next.js 14 App Router
  ├── Public pages   /{host}/{slug}, /bookings/{token}
  ├── Dashboard      /dashboard/**
  └── API Routes     /api/**
        │
        ▼
  Booking Engine (lib/)
  ├── Slot generation  — Luxon DST-aware availability
  ├── Hold creation    — advisory lock + idempotency
  ├── Confirm          — DB-time expiry check
  ├── Reschedule       — atomic in-place move
  └── Cancel           — transactional outbox write
        │
        ▼
  PostgreSQL 15
  ├── bookings            ← source of truth for capacity
  ├── notification_events ← transactional outbox
  └── idempotency_keys    ← retry cache
```

---

## Booking Correctness

### Why Postgres?

Every capacity decision, expiry check, and idempotency lookup happens inside a PostgreSQL transaction. The app server is stateless for correctness — you can restart it or run 10 replicas with no risk of a double-booking.

### Concurrency Strategy

Hold creation uses `pg_advisory_xact_lock(hashtext(event_type_id), hashtext(starts_at))`. This serializes concurrent hold attempts for the same slot. The sequence is:

```
LOCK(event, slot) ← blocks concurrent requests for same slot
  expire stale holds with hold_expires_at <= now()
  count active (held/confirmed) — safe inside lock
  if count < capacity: INSERT hold
  INSERT idempotency record
COMMIT
```

Different slots proceed in parallel. The DB count can never exceed capacity.

### Why Double-Booking Is Impossible

- The advisory lock prevents two concurrent inserts for the same slot from both seeing `count < capacity`.
- Expired holds are lazily reclaimed inside the same locked transaction.
- Rescheduling never cancels the old booking until the new slot's capacity is confirmed — in the same transaction.

### Tests That Prove It

```bash
pnpm test:concurrency
```

- Scenario A (capacity=1): 20 concurrent requests → exactly 1 success, DB count = 1
- Scenario B (capacity=5): 20 concurrent requests → exactly 5 successes, DB count ≤ 5
- Scenario C (same idempotency key): 20 concurrent requests → all 201, 1 DB row

---

## Data Model

| Table | Key columns |
|-------|------------|
| `hosts` | slug, name, timezone (IANA) |
| `event_types` | duration, capacity, buffers, min notice, horizon |
| `weekly_availability` | weekday, start/end wall-clock (multiple per day) |
| `availability_overrides` | local_date, type (day_off / custom_hours) |
| `bookings` | starts_at (timestamptz), status, hold_expires_at, management_token |
| `idempotency_keys` | key, request_hash, response_payload, expires_at |
| `notification_events` | event_type, payload, status (transactional outbox) |

All instants are `TIMESTAMPTZ`. Host-local times are `TIME`/`DATE`.

---

## Timezones and DST

Host availability is wall-clock time in the host's IANA timezone. Luxon resolves each slot to UTC using the correct offset for that specific date — including across DST transitions.

**Example (America/New_York):**

| Date | Wall clock | UTC offset | UTC |
|------|-----------|-----------|-----|
| 2024-03-08 (before DST) | 09:00 | -5 (EST) | 14:00Z |
| 2024-03-11 (after DST) | 09:00 | -4 (EDT) | 13:00Z |

A guest in Kolkata (UTC+5:30) sees 19:30 before the transition and 18:30 after.

See `docs/timezone-and-dst.md` for full detail.

---

## API

```
GET  /api/hosts/{host}/events/{slug}/slots?from&to&tz
POST /api/holds                                         (Idempotency-Key required)
POST /api/holds/{id}/confirm
POST /api/bookings/{token}/reschedule
POST /api/bookings/{token}/cancel
GET  /api/bookings/{token}
GET  /api/health
GET  /api/metrics
GET  /api/notifications
```

---

## Testing

```bash
# Unit tests (no DB)
pnpm test:unit

# Integration tests (requires PostgreSQL)
DATABASE_URL=postgres://slotbook:slotbook@localhost:5432/slotbook pnpm test:integration

# Concurrency tests — the critical ones
DATABASE_URL=postgres://slotbook:slotbook@localhost:5432/slotbook pnpm test:concurrency

# All non-E2E tests
DATABASE_URL=... pnpm test:all

# E2E (requires running server)
pnpm dev &
pnpm test:e2e
```

| Suite | Count |
|-------|-------|
| Unit | 36 |
| Integration | 10 |
| Concurrency | 3 |
| E2E | 5 |

---

## Local Development (without Docker)

```bash
cp .env.example .env
# Edit DATABASE_URL to point to your local Postgres

pnpm install
pnpm db:setup  # migrate + seed
pnpm dev
```

---

## Tradeoffs and Known Gaps

See `docs/tradeoffs.md` for the full list. Short version:

- Rate limiter is in-memory (not multi-process safe); correctness is unaffected
- No real email delivery; outbox is written durably, delivery is deferred
- Single demo host account; production would use multi-tenant auth
- No CSRF protection (API-only clients assumed)
