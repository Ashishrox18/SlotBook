# Booking Correctness

> PostgreSQL is the source of truth. Not the application server, not a cache, not a distributed lock.

## The Problem

Scheduling software has one hard correctness requirement: **a slot must never have more active bookings than its capacity**. This is trivially violated under concurrent requests without explicit serialization, because the naive sequence:

```
1. SELECT count(*) WHERE slot = X AND status IN ('held','confirmed')
2. if count < capacity: INSERT ...
```

is a classic check-then-act race condition. Two goroutines/threads can both read `count = 0`, both decide to insert, and both succeed — producing two bookings for a capacity-1 slot.

## The Strategy: Per-Slot Advisory Locks

Every hold creation transaction acquires a **PostgreSQL transaction-level advisory lock** keyed deterministically by `(event_type_id, slot_start_instant)`:

```sql
SELECT pg_advisory_xact_lock(
  hashtext('<event_type_uuid>'),
  hashtext('<starts_at_iso>')
)
```

`pg_advisory_xact_lock` blocks until the lock is acquired and is automatically released when the transaction commits or rolls back. This means:

- Two concurrent hold attempts for the **same slot** are serialized — the second blocks until the first commits.
- Concurrent holds for **different slots** are not serialized and proceed in parallel.
- A hash collision reduces parallelism only; it cannot break correctness.

Within the lock, the sequence is:

```
1. Lazily expire stale holds (UPDATE WHERE hold_expires_at <= now())
2. SELECT count(*) WHERE slot = X AND status IN ('held','confirmed')
3. If count < capacity: INSERT new hold
4. INSERT idempotency record
5. COMMIT
```

Because step 2 and step 3 happen inside a transaction that holds the advisory lock, no concurrent transaction can insert between them for the same slot.

## Why Not SELECT FOR UPDATE?

`SELECT ... FOR UPDATE` on a booking row works if there is already a row to lock. For the first booking of a slot, there is no row to lock — so you would need a separate "slot inventory" table with pre-populated rows to lock. That requires pre-generating all possible slots at creation time or at booking time, which adds complexity and couples schema design to slot-generation logic.

Advisory locks avoid this: they work for slots that have never been booked before, because the lock is keyed by the slot's identity, not a row's existence.

## Hold Expiry

Holds are created with `hold_expires_at = db_now + 5 minutes`. The database clock is authoritative. On every new hold attempt for a slot, we first lazily expire stale holds:

```sql
UPDATE bookings SET status = 'expired'
WHERE event_type_id = $1 AND starts_at = $2
  AND status = 'held' AND hold_expires_at <= now()
```

This runs inside the advisory-locked transaction, so expired capacity is visible before the count check. The application never reclaims capacity optimistically; it always uses the database's real-time count.

## Rescheduling Safety

Rescheduling does NOT cancel the old booking before guaranteeing the new slot. Instead, within one transaction:

1. Acquire the advisory lock for the **new** slot.
2. Lock the booking row with `SELECT ... FOR UPDATE`.
3. Validate the new slot.
4. Count active bookings at the new slot, excluding the booking being moved.
5. If capacity allows: `UPDATE bookings SET starts_at = new_slot` (in place).
6. Write `booking.rescheduled` notification.

The booking never disappears. If step 4 fails (no capacity), the transaction rolls back and the original booking is untouched.

## What Tests Prove This

`tests/concurrency/capacity.test.ts` fires 20 simultaneous `createHold` calls at a single slot:

- **Scenario A** (capacity=1): exactly 1 succeeds, 19 get `capacity_full`.
- **Scenario B** (capacity=5): exactly 5 succeed, the DB never holds >5 active rows.
- **Scenario C** (same idempotency key): all 20 return the same hold, 1 DB row created.

These tests run against a real PostgreSQL instance, not mocks.
