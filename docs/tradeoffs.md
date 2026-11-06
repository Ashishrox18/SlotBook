# Tradeoffs and Known Gaps

## Decisions and Alternatives

### Advisory Locks vs. Inventory Table

**Decision:** `pg_advisory_xact_lock` keyed by (event_type_id, slot_start).

**Alternatives considered:**
- Pre-populated slot inventory rows with `SELECT ... FOR UPDATE` — works well but requires either pre-generating all possible slots at setup time or a separate "ensure slot row exists" upsert on every hold attempt.
- Application-level mutex — not durable, not multi-process safe.

**Why chosen:** Advisory locks work for slots that have never been booked. No schema change required. Hash-based keys are deterministic and cheap.

**Tradeoff:** Two different (event_type_id, starts_at) pairs may collide in the 64-bit hash space. A collision serializes requests that could safely be parallel. It does not break correctness. The probability is negligible in practice.

### In-Memory Rate Limiter

**Decision:** Fixed-window in-memory limiter per IP.

**Why:** Simple, zero dependencies, adequate for a demo.

**Tradeoff:** Resets on restart; not shared across multiple app processes. In production, use Redis or an edge WAF.

### Demo Host Auth

**Decision:** A single shared password + HMAC session cookie.

**Why:** The task is scheduling correctness, not auth. A real system would use OAuth2, Clerk, or Auth0.

**Tradeoff:** Single shared password. Acceptable for demo; unacceptable in production.

### Lazy Hold Expiry

**Decision:** Expired holds are marked `expired` lazily (on the next hold attempt for that slot), not by a background job.

**Why:** Simple and correct. The capacity count query excludes expired holds by checking `hold_expires_at <= now()` directly.

**Tradeoff:** A slot that reaches capacity and has all-expired holds will not free up until someone attempts to book it. The public slots API already excludes expired holds in its capacity count query, so the calendar shows the slot as available. The lazy UPDATE is purely for status bookkeeping.

### No Background Notification Processor

**Decision:** Notifications are written to `notification_events` (outbox) but no daemon drains them to an external provider.

**Why:** The task is to demonstrate reliable recording, not delivery. The outbox pattern proves the event was atomically committed with the lifecycle change.

**Tradeoff:** Guests don't receive emails. Adding a processor (cron, Bull, Temporal) would drain the table and mark `status = 'processed'`.

## Known Gaps

| Gap | Severity | Fix |
|-----|----------|-----|
| No real email delivery | Demo only | Add outbox processor + SES/Sendgrid |
| Rate limiter is in-memory | Demo only | Redis or edge WAF |
| Single demo host account | Demo only | Multi-tenant auth |
| No CSRF protection | Low (API-only consumers) | Double-submit cookie |
| No connection pooling proxy | Dev only | Add PgBouncer in production |
| Playwright tests require a running server | Expected | `pnpm dev` or Docker |
