import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dbNow, pool, sql } from "@/lib/db";
import { ensureSchema, truncateAll } from "../helpers/db";
import { createHost, createEventType, addWeeklyWindow } from "../helpers/fixtures";
import { createHold } from "@/lib/booking/holds";

async function slotStart(minutesAhead = 120): Promise<string> {
  const now = (await dbNow()).getTime();
  const t = now + minutesAhead * 60_000;
  const grid = Math.ceil(t / (30 * 60_000)) * (30 * 60_000);
  return new Date(grid).toISOString();
}

async function setup(capacity: number) {
  const hostId = await createHost({ slug: "conc-" + Math.random().toString(36).slice(2, 8), timezone: "UTC" });
  for (let wd = 0; wd < 7; wd++) await addWeeklyWindow(hostId, wd, "00:00", "23:59");
  const eventTypeId = await createEventType(hostId, { capacity, slug: "evt" });
  return eventTypeId;
}

beforeAll(async () => {
  await ensureSchema();
});

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

const N = 20;

describe("concurrency: capacity protection", () => {
  it("Scenario A — capacity=1: 20 concurrent requests yield exactly 1 active booking", async () => {
    const eventTypeId = await setup(1);
    const start = await slotStart();
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        createHold({ idempotencyKey: `a-${i}`, eventTypeId, startsAtIso: start, ip: `10.1.1.${i}` }),
      ),
    );
    const successes = results.filter((r) => r.statusCode === 201);
    const fulls = results.filter((r) => r.statusCode === 409 && (r.body as { code?: string }).code === "capacity_full");
    expect(successes.length).toBe(1);
    expect(fulls.length).toBe(N - 1);

    const active = await sql<{ count: string }>`SELECT count(*)::text FROM bookings
      WHERE event_type_id = ${eventTypeId} AND starts_at = ${start} AND status IN ('held','confirmed')`;
    expect(Number(active.rows[0]!.count)).toBe(1);
  });

  it("Scenario B — capacity=5: 20 concurrent requests yield exactly 5 active holds, never 6+", async () => {
    const eventTypeId = await setup(5);
    const start = await slotStart();
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        createHold({ idempotencyKey: `b-${i}`, eventTypeId, startsAtIso: start, ip: `10.2.2.${i}` }),
      ),
    );
    const successes = results.filter((r) => r.statusCode === 201);
    expect(successes.length).toBe(5);

    const active = await sql<{ count: string }>`SELECT count(*)::text FROM bookings
      WHERE event_type_id = ${eventTypeId} AND starts_at = ${start} AND status IN ('held','confirmed')`;
    expect(Number(active.rows[0]!.count)).toBe(5);
    expect(Number(active.rows[0]!.count)).toBeLessThanOrEqual(5);
  });

  it("Scenario C — same Idempotency-Key concurrent: one logical hold, consistent response, no duplicates", async () => {
    const eventTypeId = await setup(5);
    const start = await slotStart();
    const key = "same-concurrent-key";
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        createHold({ idempotencyKey: key, eventTypeId, startsAtIso: start, ip: "10.3.3.1" }),
      ),
    );
    // Every retry must return the same successful hold (201), not a capacity error.
    for (const r of results) expect(r.statusCode).toBe(201);
    const ids = new Set(results.map((r) => (r.body as { id: string }).id));
    expect(ids.size).toBe(1);

    const count = await sql<{ count: string }>`SELECT count(*)::text FROM bookings
      WHERE event_type_id = ${eventTypeId} AND starts_at = ${start} AND status IN ('held','confirmed')`;
    expect(Number(count.rows[0]!.count)).toBe(1);
  });
});
