# Failure Modes and Protections

This document is the Reliability Matrix. For every failure mode it lists: what goes wrong, the protection in place, and the test that proves it.

---

## Reliability Matrix

| Failure | Protection | Test |
|---------|-----------|------|
| Two concurrent holds for capacity-1 slot | Per-slot advisory lock serializes inserts | `capacity.test.ts` Scenario A |
| 20 concurrent holds for capacity-5 slot | Same lock; count inside lock; DB count asserted | `capacity.test.ts` Scenario B |
| Duplicate request (same Idempotency-Key) | `idempotency_keys` table caches result; replay returns same hold | `capacity.test.ts` Scenario C |
| Idempotency-Key reused with different body | `request_hash` mismatch → 409 conflict | `api-contract.test.ts` idempotency conflict |
| Expired hold confirmation attempt | `hold_expires_at <= now()` check with DB time before UPDATE | `booking.test.ts` expired hold |
| Expired hold + confirmation race (concurrent) | `FOR UPDATE` row lock; DB time checked inside lock | `failure-injection.test.ts` expired hold race |
| Duplicate confirmation (lost network response) | Status check: already `confirmed` → 200 replay, 1 notification row | `failure-injection.test.ts` duplicate confirmation |
| Reschedule to full slot | Advisory lock on new slot; count excluding self | `booking.test.ts` reschedule fails |
| Two simultaneous reschedules to same slot | Lock + count check under lock | `failure-injection.test.ts` concurrent reschedules |
| Transaction rollback mid-booking | Postgres ROLLBACK; no partial row exists | `failure-injection.test.ts` rollback test |
| App server restart with active holds | Holds live in Postgres with `hold_expires_at`; no in-memory state needed | `failure-injection.test.ts` restart test |
| Client sends past timestamp (clock skew) | `isValidSlotPlacement` uses `dbNow()`; past slots fail | `failure-injection.test.ts` clock skew |
| Client sends far-future timestamp | Booking horizon check uses DB time | `failure-injection.test.ts` clock skew |
| Invalid booking lifecycle transition | `assertTransition()` in state machine throws | `state-machine.test.ts` |
| Notification write failure | Same transaction as lifecycle change; if notification fails, booking rolls back | Postgres ACID |
| Guest guessing another guest's booking URL | Management token is 256 bits of CSPRNG; not guessable | `api-contract.test.ts` token boundary |
| DST: host 09:00 maps to wrong UTC | Luxon resolves per-date offset; unit-tested on DST boundary | `time-dst.test.ts` |

---

## Detailed Failure Analysis

### F-1: Concurrent hold creation

**Scenario:** 20 clients simultaneously POST `/api/holds` for the same capacity-1 slot.

**Without protection:** The naive check-then-insert pattern allows all 20 to read `count=0` and all insert — resulting in 20 active holds.

**Protection:** `pg_advisory_xact_lock(hashtext(event_type_id), hashtext(starts_at))` serializes the transactions for the same slot. The second through twentieth transaction block until the first commits, then each sees `count >= capacity`.

**Proof:** `pnpm test:concurrency` — DB count asserted to equal exactly 1 (or N for capacity-N).

---

### F-2: Application restart while holds exist

**Scenario:** App crashes or deploys while 10 holds are active. On restart, do those holds still expire correctly?

**Without protection:** If expiry were tracked in memory (e.g., `setTimeout`), a restart loses all timers.

**Protection:** Holds have `hold_expires_at` stored in Postgres. On every new hold attempt, expired holds are reclaimed by `UPDATE ... WHERE hold_expires_at <= now()`. No in-memory state required.

**Proof:** `failure-injection.test.ts` — forces a hold's `hold_expires_at` to the past, then asserts a new hold for the same slot succeeds.

---

### F-3: Rescheduling race — "cancel before guarantee"

**Scenario:** Reschedule request 1 cancels the original booking; before it can check the new slot, the server crashes. Guest has no booking.

**Protection:** Rescheduling never cancels. It uses `UPDATE bookings SET starts_at = new_slot` atomically. The booking only moves after capacity at the new slot is confirmed within the same transaction.

**Proof:** `booking.test.ts` — reschedule to a full slot returns 409; original booking is untouched.

---

### F-4: Notification not delivered

**Scenario:** A notification email fails to send after the booking is confirmed.

**Protection:** `notification_events` rows are inserted in the same transaction as the booking status change. If the booking commits, the notification row is guaranteed to exist. Delivery is a separate concern (an outbox processor would drain the table independently). A delivery failure cannot revert the booking.

**Proof:** Every integration test asserts notification rows exist immediately after lifecycle transitions.

---

### F-5: Duplicate network request

**Scenario:** A guest's browser retries a confirm request because the network response was lost.

**Protection:** The confirm handler reads the booking row with `FOR UPDATE` and checks `status`. If already `confirmed`, it returns the committed booking (200) without creating a second notification. Confirming is naturally idempotent.

**Proof:** `failure-injection.test.ts` duplicate confirmation test — 1 notification row, 200 on both calls.
