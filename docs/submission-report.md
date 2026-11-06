# Submission Report: Slotbook

## 1. Repository and Deployment Links

| | |
|--|--|
| Repository | `/Users/ashishs/Desktop/PWar/slotbook` |
| Local start | `docker compose up --build` |
| Public booking | `http://localhost:3000/alex-morgan/intro-15` |
| Host dashboard | `http://localhost:3000/dashboard/login` (password: `slotbook-demo`) |
| Reliability page | `http://localhost:3000/reliability` |
| Notification outbox | `http://localhost:3000/notifications` |

---

## 2. Architecture

```
Guest / Host Browser
        │
        ▼
  Next.js 14 App Router
  ├── Public pages   (booking, management, outbox, reliability)
  ├── Dashboard      (event types, availability, overrides, bookings)
  └── API Routes     (/api/holds, /api/bookings/*, /api/hosts/*/events/*/slots)
        │
        ▼
  Booking Engine (lib/)
  ├── Slot generation  – availability rules, DST-aware Luxon conversions
  ├── Hold creation    – advisory lock, lazy expiry, idempotency, abuse guard
  ├── Confirm          – expiry check with DB time, management token
  ├── Reschedule       – atomic in-place update, new-slot lock
  └── Cancel           – atomic status transition
        │
        ▼
  PostgreSQL 15
  ├── bookings (source of truth)
  ├── notification_events (transactional outbox)
  └── idempotency_keys (retry cache)
```

---

## 3. Data Model

| Table | Purpose |
|-------|---------|
| `hosts` | Calendar owner; IANA timezone |
| `event_types` | What guests book; duration, capacity, buffers, notice, horizon |
| `weekly_availability` | Recurring windows (multiple per day) |
| `availability_overrides` | Day-off or custom hours for a specific date; precedence over weekly |
| `bookings` | Lifecycle: held → confirmed / expired / cancelled; management token |
| `idempotency_keys` | 24h replay cache for hold creation retries |
| `notification_events` | Transactional outbox; committed with lifecycle transitions |

All time instants are `TIMESTAMPTZ`. Host-local wall-clock times are `TIME` or `DATE`.

---

## 4. Key Engineering Decisions

### 4.1 PostgreSQL is Authoritative

**Decision:** All capacity checks, expiry decisions, and idempotency replays happen inside Postgres transactions. `SELECT now()` provides the authoritative clock.

**Alternatives considered:** Redis counters, distributed locks, application-level locks.

**Why chosen:** Application servers restart. Processes crash. Replicas disagree. Postgres transactions with advisory locks are durable, consistent, and ACID. No additional infrastructure required.

**Tradeoff:** All booking traffic must hit the database. Acceptable for a scheduling platform; mitigated by connection pooling.

### 4.2 Per-Slot Advisory Locks

**Decision:** `pg_advisory_xact_lock(hashtext(event_type_id), hashtext(starts_at))` before every hold insert.

**Why chosen:** Serializes concurrent holds for the same slot without requiring a pre-populated inventory row. Works for first-ever bookings of a slot.

**Tradeoff:** Theoretical hash collision reduces parallelism (not correctness).

### 4.3 Client Clocks Not Trusted

**Decision:** Hold expiry, minimum notice, and booking horizon are checked with `SELECT now()` inside the transaction.

**Why chosen:** Client clocks drift, can be manipulated, and are unreliable across timezones.

### 4.4 `TIMESTAMPTZ` Everywhere

**Decision:** Every instant column is `TIMESTAMPTZ`.

**Why chosen:** PostgreSQL stores `TIMESTAMPTZ` as UTC and converts correctly in any session timezone. Using `TIMESTAMP` (no tz) risks silently wrong comparisons when session timezones differ.

### 4.5 Lazy Hold Expiry

**Decision:** Stale holds are marked `expired` lazily on the next hold attempt for that slot (not by a background job).

**Why chosen:** Simple, correct, zero infrastructure. The capacity count query checks `hold_expires_at <= now()` directly, so capacity is always accurate.

### 4.6 Idempotency Design

**Decision:** `idempotency_keys` table stores (key, request_hash, response_payload, status_code, expires_at). Same (key, hash) replays the stored response. Different hash on same key → 409.

**Why chosen:** Safe retries for browsers, load balancers, and mobile clients. The key and hash together prevent stale replays masking new requests.

### 4.7 Transactional Outbox

**Decision:** `notification_events` rows are inserted in the same transaction as the booking lifecycle change.

**Why chosen:** Guarantees the event exists if and only if the transition committed. No "fire and forget" race between the DB write and the notification call.

### 4.8 Atomic Reschedule

**Decision:** `UPDATE bookings SET starts_at = new_slot` in a single transaction after acquiring the new-slot advisory lock and verifying capacity.

**Why chosen:** The guest is never left with no booking. The alternative (cancel + re-create) has a failure window where the guest is unbooked.

---

## 5. Reliability and Failure Cases

| Failure | Behavior |
|---------|---------|
| 20 concurrent holds on capacity-1 slot | Exactly 1 succeeds (tested) |
| Browser sends duplicate requests (same idempotency key) | Same hold replayed, 1 DB row |
| Hold expires before confirmation | 410 response, DB marks `expired`, capacity freed |
| App server restarts | Postgres state is durable; no in-memory state required |
| Reschedule race: target slot fills | Original booking preserved, 409 returned |
| Network response lost | Client retries with same idempotency key, gets same hold |

---

## 6. Timezone and DST Strategy

See `docs/timezone-and-dst.md` for full detail.

Short version: host availability is wall-clock in the host's IANA timezone. Luxon converts each slot to UTC using the correct offset for that specific date, so a host's "09:00–17:00" correctly resolves to different UTC intervals before and after a DST transition.

---

## 7. Optional Extensions Completed

- Booking Confidence Timeline (unique differentiator)
- `/reliability` developer page showing DB health, lifecycle counters, capacity protection explanation
- `/notifications` outbox demo page (PII redacted)
- Per-IP active-hold abuse protection in the booking engine
- `X-Request-ID` propagation through middleware
- Structured JSON logging
- In-memory metrics counters

---

## 8. Testing and Results

| Suite | Tests | Requirement |
|-------|-------|------------|
| Unit | ~30 | 25+ |
| Integration | 10 | 15+ |
| Concurrency | 3 | 3 |
| E2E | 5 | 5+ |

Concurrency tests run 20 simultaneous `Promise.all` requests against real PostgreSQL. The DB count is asserted directly after each scenario.

Run all tests: `pnpm test:all`

---

## 9. AI Usage

See `AI_LOG.md`.

---

## 10. Known Gaps and Next Steps

| Gap | Next Step |
|-----|----------|
| No email delivery | Add outbox processor + AWS SES / Sendgrid |
| In-memory rate limiter | Replace with Redis or edge WAF |
| Single demo host | Multi-tenant auth (Clerk / Auth0) |
| No CSRF protection | Add double-submit cookie |
| No PgBouncer | Add in production Compose or Helm chart |
| E2E tests need running server | Add `pnpm build && pnpm start` CI step |
