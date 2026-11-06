# Testing

## Quick Start

```bash
# 1. Start PostgreSQL
docker compose up db -d

# 2. Set DATABASE_URL
export DATABASE_URL=postgres://slotbook:slotbook@localhost:5432/slotbook

# 3. Migrate + seed
pnpm db:setup

# 4. Run all unit + integration + concurrency tests
pnpm test:all

# 5. E2E (requires the dev server running)
pnpm dev &
pnpm test:e2e
```

## Test Categories

### Unit Tests (no DB)  `tests/unit/`

| File | What it covers |
|------|----------------|
| `slots.test.ts` | Slot generation, buffers, multiple windows, overrides, min notice, horizon, DST-aware placement |
| `time-dst.test.ts` | DST conversions (EST↔EDT), Kolkata viewer, weekday mapping, zone validation |
| `validation.test.ts` | All Zod schemas, constraint boundaries |
| `auth.test.ts` | Idempotency hashing, session token round-trip, management token entropy |

Run: `pnpm test:unit`

### Integration Tests (real PostgreSQL)  `tests/integration/`

| Test | What it covers |
|------|----------------|
| hold + confirm lifecycle | creates hold, confirms, writes notification |
| expired hold not confirmable | DB time check, status transition to `expired` |
| capacity=1 blocks second hold | `capacity_full` 409 |
| expired hold frees capacity | lazy expiry in count query |
| capacity=5 sequential holds | exactly 5 succeed |
| idempotency replay | same (key, body) → same hold, 1 DB row |
| idempotency conflict | same key, different body → 409 |
| cancel + notification | status `cancelled`, outbox event |
| reschedule success | booking moves atomically |
| reschedule when target full | 409, original booking unchanged |

Run: `pnpm test:integration`

### Concurrency Tests (real PostgreSQL)  `tests/concurrency/`

These are the most important tests. They run 20 simultaneous `createHold` calls via `Promise.all` against real PostgreSQL and assert the database-level count.

| Scenario | Capacity | Requests | Expected successes |
|----------|----------|----------|--------------------|
| A | 1 | 20 | exactly 1 |
| B | 5 | 20 | exactly 5 |
| C (same idempotency key) | 5 | 20 | all 201, 1 DB row |

Run: `pnpm test:concurrency`

### E2E Tests (Playwright)  `e2e/`

| File | What it covers |
|------|----------------|
| `booking.spec.ts` | Guest books a slot end to end; outbox shows confirmed event; booking page renders |
| `manage.spec.ts` | Guest reschedules; guest cancels |
| `dashboard.spec.ts` | Host logs in; reliability page renders |

Run: `pnpm test:e2e`

## What Tests Intentionally Don't Do

- Inflate counts with trivial unit tests.
- Use mocked databases for correctness tests.
- Skip concurrent requests in favour of sequential simulation.
