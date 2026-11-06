# Operational Runbook

This runbook is for engineers operating Slotbook in production (or debugging the demo environment). Each section covers a specific symptom, diagnostic steps, and remediation.

---

## Slot Appears Overbooked

**Symptom:** A host reports two bookings for the same time slot.

**Diagnostic queries:**

```sql
-- Count active bookings per slot for an event type
SELECT starts_at, status, count(*)
FROM bookings
WHERE event_type_id = '<id>'
GROUP BY starts_at, status
HAVING count(*) > 1;

-- List all active bookings for a specific slot
SELECT id, status, guest_email, hold_expires_at, created_at
FROM bookings
WHERE event_type_id = '<id>'
  AND starts_at = '<iso>'
  AND status IN ('held', 'confirmed');
```

**Expected:** `count(*) <= capacity` for every (event_type_id, starts_at) pair for active statuses.

**If count > capacity:**
1. Check whether any `held` bookings have a past `hold_expires_at` — these should have been lazily expired. Run the manual cleanup:
   ```sql
   UPDATE bookings SET status = 'expired'
   WHERE status = 'held' AND hold_expires_at <= now();
   ```
2. Check `pg_locks` for any lingering advisory locks (should not exist outside an active transaction):
   ```sql
   SELECT * FROM pg_locks WHERE locktype = 'advisory';
   ```
3. Check application logs for any unhandled exceptions during hold creation — a transaction that committed without the capacity check completing would indicate a code bug. Check `X-Request-ID` in the error.

**Root cause:** This should be impossible under normal operation. If it occurs, it likely indicates a migration was applied without the advisory lock code (old app version ran after a DB reset) or direct DB manipulation.

---

## Guest Says Confirmation Failed

**Symptom:** Guest reports clicking Confirm but never received a management link.

**Diagnostic steps:**

1. Ask for the approximate time and their email. Look up by email:
   ```sql
   SELECT id, status, hold_expires_at, management_token, created_at
   FROM bookings
   WHERE guest_email = 'guest@example.com'
   ORDER BY created_at DESC LIMIT 5;
   ```

2. Check the idempotency record — if the browser retried, there should be a cached result:
   ```sql
   SELECT key, status_code, response_payload, expires_at
   FROM idempotency_keys
   WHERE created_at > now() - interval '1 hour';
   ```

3. Check the notification outbox:
   ```sql
   SELECT id, event_type, status, created_at
   FROM notification_events
   WHERE booking_id = '<booking_id>';
   ```

4. Check structured logs for the request — filter by `X-Request-ID` if the guest's browser reported one.

**Likely causes:**
- Hold expired before confirmation: booking status will be `expired`.
- Network request never reached the server: no booking row exists.
- Confirmation succeeded but response was lost: booking is `confirmed`, management token exists — resend the link from the booking row.

---

## Slots Not Appearing on the Booking Page

**Symptom:** The booking page shows "No available slots" but the host expects availability.

**Diagnostic steps:**

1. Check the host's weekly availability:
   ```sql
   SELECT weekday, start_local_time, end_local_time
   FROM weekly_availability
   WHERE host_id = (SELECT id FROM hosts WHERE slug = '<slug>');
   ```

2. Check for an override on the target date:
   ```sql
   SELECT * FROM availability_overrides
   WHERE host_id = (SELECT id FROM hosts WHERE slug = '<slug>')
     AND local_date = '<YYYY-MM-DD>';
   ```
   A `day_off` override suppresses all slots.

3. Check minimum notice: if `minimum_notice_minutes = 120` and the guest is looking at slots less than 2 hours away, they will not appear.

4. Check booking horizon: if `booking_horizon_days = 30` and the guest is requesting dates 31+ days away, they will not appear.

5. Check the viewer timezone vs host timezone. A guest in a timezone ahead of the host may be requesting a date that is still the previous day in the host's timezone.

6. Call the slots API directly to see the raw response:
   ```bash
   curl "http://localhost:3000/api/hosts/alex-morgan/events/intro-15/slots?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=UTC"
   ```

---

## Database Unavailable

**Symptom:** `/api/health` returns `status: degraded` or 503.

**Check health endpoint:**
```bash
curl http://localhost:3000/api/health
```

**Expected response:**
```json
{"status": "ok", "database": "connected", "server_time": "..."}
```

**If degraded:**
1. Check Postgres is running: `docker compose ps db`
2. Check connection string: `DATABASE_URL` in app environment.
3. Check connection pool exhaustion: if `max: 20` connections are all held (e.g., long-running transactions from a bug), new requests will queue and eventually time out.
4. Check `pg_stat_activity` for idle transactions:
   ```sql
   SELECT pid, state, query_start, query, wait_event_type
   FROM pg_stat_activity
   WHERE state != 'idle'
   ORDER BY query_start;
   ```

**Application behaviour when DB is unavailable:**
- All API routes that touch the DB return 500.
- `/api/health` returns 503 with the error message.
- Static pages (client-side React) continue to render; API calls will show error states.
- No data is lost — Postgres durability is unaffected by app availability.

---

## Hold Expired Before Guest Could Confirm

**Symptom:** Guest receives "Hold expired" message. They want to know why their time ran out quickly.

**Expected behaviour:** Holds expire 5 minutes after creation (`hold_expires_at = db_now + 5 minutes`). This is intentional. Client-side countdown is display only; server time is authoritative.

**Remediation:** Direct guest to select a new slot. If this happens frequently, consider increasing `HOLD_TTL_MINUTES` in `lib/booking/holds.ts` (current: 5 minutes).

---

## Notification Events Stuck in `pending`

**Symptom:** `/notifications` page shows events in `pending` status with old `created_at`.

**Cause:** There is no background outbox processor in this demo. `pending` is the correct initial state; it would be updated to `processed` by a real processor (e.g., a cron job or Bull worker).

**In the demo:** This is expected. Events in `pending` are durably recorded and can be processed at any time.

**Query to inspect:**
```sql
SELECT id, event_type, status, created_at
FROM notification_events
ORDER BY created_at DESC LIMIT 20;
```

---

## Running the Concurrency Tests Manually

To verify capacity protection at any time:

```bash
DATABASE_URL=postgres://slotbook:slotbook@localhost:5432/slotbook \
  pnpm test:concurrency
```

Expected output:
```
✓ Scenario A — capacity=1: 20 concurrent → exactly 1 active booking
✓ Scenario B — capacity=5: 20 concurrent → exactly 5 active holds, never 6+
✓ Scenario C — same Idempotency-Key: one logical hold, consistent response
```
