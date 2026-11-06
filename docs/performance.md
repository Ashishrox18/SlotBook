# Query Performance and Index Design

## Design Principle

Application logic prevents bad requests; database constraints and indexes prevent impossible states and slow queries.

Every index was chosen by tracing the hot query paths. The schema creates them in `0001_init.sql`.

---

## Index Inventory

### `bookings_capacity_idx`

```sql
CREATE INDEX bookings_capacity_idx ON bookings(event_type_id, starts_at)
  WHERE status IN ('held', 'confirmed');
```

**Used by:** The capacity count query inside every hold creation:
```sql
SELECT count(*) FROM bookings
WHERE event_type_id = $1 AND starts_at = $2
  AND status IN ('held', 'confirmed')
```

**Why partial index?** The WHERE clause limits the index to active bookings only. Expired and cancelled bookings (which accumulate over time) are not indexed here, so the index stays small and fast forever.

---

### `bookings_management_token_uq`

```sql
CREATE UNIQUE INDEX bookings_management_token_uq ON bookings(management_token)
  WHERE management_token IS NOT NULL;
```

**Used by:** Every guest management page load and reschedule/cancel:
```sql
SELECT * FROM bookings WHERE management_token = $1
```

**Why unique partial?** Only confirmed bookings have a token. The partial index skips held/expired/cancelled rows that have no token.

---

### `bookings_ip_active_idx`

```sql
CREATE INDEX bookings_ip_active_idx ON bookings(event_type_id, created_by_ip, status)
  WHERE status = 'held';
```

**Used by:** Abuse protection — max active holds per IP per event.

---

### `event_types_host_idx`

```sql
CREATE INDEX event_types_host_idx ON event_types(host_id);
```

**Used by:** Dashboard loading all event types for a host.

---

### `weekly_availability_host_idx`

```sql
CREATE INDEX weekly_availability_host_idx ON weekly_availability(host_id, weekday);
```

**Used by:** Slot generation — loading all windows for a host filtered by weekday.

---

### `availability_overrides_host_idx`

```sql
CREATE INDEX availability_overrides_host_idx ON availability_overrides(host_id, local_date);
```

**Used by:** Slot generation — looking up overrides for a specific date range.

---

### `notification_events_status_idx`

```sql
CREATE INDEX notification_events_status_idx ON notification_events(status, created_at);
```

**Used by:** An outbox processor draining pending events in order.

---

### `idempotency_expires_idx`

```sql
CREATE INDEX idempotency_expires_idx ON idempotency_keys(expires_at);
```

**Used by:** A cleanup job removing expired idempotency records.

---

## Critical Query: Capacity Count

This query runs inside every hold creation and is the most performance-sensitive:

```sql
SELECT count(*)::text FROM bookings
WHERE event_type_id = '...'
  AND starts_at = '...'
  AND status IN ('held', 'confirmed');
```

With `bookings_capacity_idx` this is an index-only scan. As the `bookings` table grows with historical data, this query remains O(active bookings for this slot), not O(all bookings).

### EXPLAIN ANALYZE (example with empty table)

```
Index Only Scan using bookings_capacity_idx on bookings
  Index Cond: ((event_type_id = '...') AND (starts_at = '...'))
  Heap Fetches: 0
  Planning Time: 0.1 ms
  Execution Time: 0.05 ms
```

---

## Database Constraints as Second Line of Defence

Beyond indexes, the schema enforces invariants that application logic cannot violate:

| Constraint | Protection |
|-----------|-----------|
| `et_duration_range CHECK (duration_minutes BETWEEN 15 AND 120)` | No 1-minute or 999-minute events |
| `et_capacity_min CHECK (capacity >= 1)` | No zero-capacity events |
| `et_buffer_before CHECK (buffer_before_minutes BETWEEN 0 AND 30)` | No negative or excessive buffers |
| `bk_status_check CHECK (status IN ('held','confirmed','cancelled','expired'))` | No unknown status values |
| `bk_held_has_hold_expiry CHECK (status <> 'held' OR hold_expires_at IS NOT NULL)` | Every held booking has an expiry |
| `UNIQUE(host_id, slug)` on event_types | No slug collisions per host |
| `UNIQUE(host_id, local_date)` on availability_overrides | One override per date |
| `bookings_management_token_uq` | Tokens never collide |

The application enforces these at the Zod layer first, but the DB constraints are the safety net for bugs, direct DB access, or future code paths.
