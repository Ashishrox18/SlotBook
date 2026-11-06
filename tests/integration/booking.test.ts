import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { dbNow, pool, sql } from "@/lib/db";
import { ensureSchema, truncateAll } from "../helpers/db";
import { createHost, createEventType, addWeeklyWindow } from "../helpers/fixtures";
import { createHold } from "@/lib/booking/holds";
import { confirmHold } from "@/lib/booking/confirm";
import { cancelBooking } from "@/lib/booking/cancel";
import { rescheduleBooking } from "@/lib/booking/reschedule";
import { getBookingByToken } from "@/lib/booking/queries";

/** A 30-min-grid UTC slot start a safe distance in the future. */
async function slotStart(minutesAhead = 120): Promise<string> {
  const now = (await dbNow()).getTime();
  const t = now + minutesAhead * 60_000;
  const grid = Math.ceil(t / (30 * 60_000)) * (30 * 60_000);
  return new Date(grid).toISOString();
}

async function setup(capacity = 1, minimumNotice = 0, duration = 30) {
  const hostId = await createHost({ slug: "host-" + Math.random().toString(36).slice(2, 8), timezone: "UTC" });
  // Availability every weekday 00:00-23:59 so any 30-min UTC grid is valid.
  for (let wd = 0; wd < 7; wd++) {
    await addWeeklyWindow(hostId, wd, "00:00", "23:59");
  }
  const eventTypeId = await createEventType(hostId, { capacity, minimumNotice, duration, slug: "evt" });
  return { hostId, eventTypeId };
}

let ctx: { hostId: string; eventTypeId: string };

beforeAll(async () => {
  await ensureSchema();
});

beforeEach(async () => {
  await truncateAll();
  ctx = await setup(1);
});

afterAll(async () => {
  await pool.end();
});

describe("hold + confirm lifecycle", () => {
  it("creates a hold then confirms it", async () => {
    const start = await slotStart();
    const h = await createHold({ idempotencyKey: "k1", eventTypeId: ctx.eventTypeId, startsAtIso: start, ip: "10.0.0.1" });
    expect(h.statusCode).toBe(201);
    expect((h.body as { hold_expires_at: string }).hold_expires_at).toBeTruthy();

    const holdId = (h.body as { id: string }).id;
    const c = await confirmHold({ holdId, guestName: "Guest", guestEmail: "g@example.com" });
    expect(c.statusCode).toBe(200);
    const body = c.body as { status: string; management_token: string; management_url: string };
    expect(body.status).toBe("confirmed");
    expect(body.management_token).toHaveLength(64);

    const booking = await getBookingByToken(body.management_token);
    expect(booking?.status).toBe("confirmed");
    expect(booking?.guest_email).toBe("g@example.com");
  });

  it("writes a notification event on confirmation", async () => {
    const start = await slotStart();
    const h = await createHold({ idempotencyKey: "k1", eventTypeId: ctx.eventTypeId, startsAtIso: start, ip: "10.0.0.1" });
    const holdId = (h.body as { id: string }).id;
    const c = await confirmHold({ holdId, guestName: "Guest", guestEmail: "g@example.com" });
    const token = (c.body as { management_token: string }).management_token;

    const notifs = await sql<{ event_type: string }>`SELECT event_type FROM notification_events WHERE booking_id IN (SELECT id FROM bookings WHERE management_token = ${token})`;
    expect(notifs.rows.map((r) => r.event_type)).toContain("booking.confirmed");
  });

  it("does not confirm an expired hold", async () => {
    const start = await slotStart();
    const h = await createHold({ idempotencyKey: "k1", eventTypeId: ctx.eventTypeId, startsAtIso: start, ip: "10.0.0.1" });
    const holdId = (h.body as { id: string }).id;
    // Force expiry in the past.
    await sql`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = ${holdId}`;
    const c = await confirmHold({ holdId, guestName: "Guest", guestEmail: "g@example.com" });
    expect(c.statusCode).toBe(410);
    const statusRow = await sql<{ status: string }>`SELECT status FROM bookings WHERE id = ${holdId}`;
    expect(statusRow.rows[0]!.status).toBe("expired");
  });
});

describe("capacity enforcement", () => {
  it("allows only one active booking for capacity=1", async () => {
    const start = await slotStart();
    const h1 = await createHold({ idempotencyKey: "k1", eventTypeId: ctx.eventTypeId, startsAtIso: start, ip: "10.0.0.1" });
    expect(h1.statusCode).toBe(201);
    const h2 = await createHold({ idempotencyKey: "k2", eventTypeId: ctx.eventTypeId, startsAtIso: start, ip: "10.0.0.2" });
    expect(h2.statusCode).toBe(409);
    expect((h2.body as { code: string }).code).toBe("capacity_full");
  });

  it("expired holds free up capacity", async () => {
    const start = await slotStart();
    const h1 = await createHold({ idempotencyKey: "k1", eventTypeId: ctx.eventTypeId, startsAtIso: start, ip: "10.0.0.1" });
    const holdId = (h1.body as { id: string }).id;
    await sql`UPDATE bookings SET hold_expires_at = now() - interval '1 minute' WHERE id = ${holdId}`;
    // A new hold should now succeed (the stale hold no longer counts).
    const h2 = await createHold({ idempotencyKey: "k2", eventTypeId: ctx.eventTypeId, startsAtIso: start, ip: "10.0.0.2" });
    expect(h2.statusCode).toBe(201);
  });

  it("respects capacity=5 with five concurrent-ish sequential holds", async () => {
    await truncateAll();
    ctx = await setup(5);
    const start = await slotStart();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        createHold({ idempotencyKey: `k${i}`, eventTypeId: ctx.eventTypeId, startsAtIso: start, ip: `10.0.0.${i}` }),
      ),
    );
    const successes = results.filter((r) => r.statusCode === 201).length;
    expect(successes).toBe(5);
    const active = await sql<{ count: string }>`SELECT count(*)::text FROM bookings WHERE event_type_id = ${ctx.eventTypeId} AND starts_at = ${start} AND status IN ('held','confirmed')`;
    expect(Number(active.rows[0]!.count)).toBe(5);
  });
});

describe("idempotency", () => {
  it("replays the same key+request and creates only one hold", async () => {
    const start = await slotStart();
    const a = await createHold({ idempotencyKey: "same-key", eventTypeId: ctx.eventTypeId, startsAtIso: start, ip: "10.0.0.1" });
    const b = await createHold({ idempotencyKey: "same-key", eventTypeId: ctx.eventTypeId, startsAtIso: start, ip: "10.0.0.1" });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect((a.body as { id: string }).id).toBe((b.body as { id: string }).id);
    const count = await sql<{ count: string }>`SELECT count(*)::text FROM bookings WHERE event_type_id = ${ctx.eventTypeId} AND starts_at = ${start}`;
    expect(Number(count.rows[0]!.count)).toBe(1);
  });

  it("conflicts when the same key is reused with a different request", async () => {
    const s1 = await slotStart(120);
    const s2 = await slotStart(180);
    const a = await createHold({ idempotencyKey: "dup-key", eventTypeId: ctx.eventTypeId, startsAtIso: s1, ip: "10.0.0.1" });
    const b = await createHold({ idempotencyKey: "dup-key", eventTypeId: ctx.eventTypeId, startsAtIso: s2, ip: "10.0.0.2" });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(409);
    expect((b.body as { code: string }).code).toBe("idempotency_conflict");
  });
});

describe("cancel + reschedule", () => {
  let keyIdx = 0;
  async function makeConfirmed(slot?: string) {
    const start = slot ?? (await slotStart());
    const key = `cr-${++keyIdx}-${Date.now()}`;
    const h = await createHold({ idempotencyKey: key, eventTypeId: ctx.eventTypeId, startsAtIso: start, ip: "10.0.0.1" });
    expect(h.statusCode).toBe(201);
    const c = await confirmHold({ holdId: (h.body as { id: string }).id, guestName: "Guest", guestEmail: "g@example.com" });
    expect(c.statusCode).toBe(200);
    return { start, token: (c.body as { management_token: string }).management_token };
  }

  it("cancels a confirmed booking and frees capacity", async () => {
    const { token, start } = await makeConfirmed();
    const c = await cancelBooking({ token, reason: "schedule conflict" });
    expect(c.statusCode).toBe(200);
    expect((c.body as { status: string }).status).toBe("cancelled");
    // Now the slot is free again.
    const h = await createHold({ idempotencyKey: "after-cancel", eventTypeId: ctx.eventTypeId, startsAtIso: start, ip: "10.0.0.2" });
    expect(h.statusCode).toBe(201);
    const notifs = await sql<{ event_type: string }>`SELECT event_type FROM notification_events WHERE event_type = 'booking.cancelled'`;
    expect(notifs.rows.length).toBeGreaterThan(0);
  });

  it("reschedules atomically to a new slot", async () => {
    const { token } = await makeConfirmed();
    const newStart = await slotStart(240);
    const r = await rescheduleBooking({ token, newStartsAtIso: newStart });
    expect(r.statusCode).toBe(200);
    const booking = await getBookingByToken(token);
    expect(booking?.starts_at).toBe(newStart);
    const notifs = await sql<{ event_type: string }>`SELECT event_type FROM notification_events WHERE event_type = 'booking.rescheduled'`;
    expect(notifs.rows.length).toBeGreaterThan(0);
  });

  it("reschedule fails atomically when target slot is full", async () => {
    // Use explicit well-separated slots to avoid any grid overlap.
    const mySlot = await slotStart(120);
    const { token, start } = await makeConfirmed(mySlot);

    // Fill a DIFFERENT target slot (4h ahead) with another booking (capacity=1).
    const targetSlot = await slotStart(360);
    const fillKey = `fill-${Date.now()}`;
    const h = await createHold({ idempotencyKey: fillKey, eventTypeId: ctx.eventTypeId, startsAtIso: targetSlot, ip: "10.0.0.9" });
    expect(h.statusCode).toBe(201);
    await confirmHold({ holdId: (h.body as { id: string }).id, guestName: "Other", guestEmail: "o@example.com" });

    // Now try to reschedule the first booking into the full target slot.
    const r = await rescheduleBooking({ token, newStartsAtIso: targetSlot });
    expect(r.statusCode).toBe(409);
    // Original booking is untouched.
    const booking = await getBookingByToken(token);
    expect(booking?.starts_at).toBe(start);
    expect(booking?.status).toBe("confirmed");
  });
});
