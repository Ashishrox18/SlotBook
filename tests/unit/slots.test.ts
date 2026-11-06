import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { generateSlotsForDate, isValidSlotPlacement } from "@/lib/availability/slots";
import { effectiveWindowsForDate } from "@/lib/time";
import type { EventType, Host, OverrideRow, WeeklyWindow } from "@/lib/types";

function et(opts: Partial<EventType> = {}): EventType {
  return {
    id: "et-1",
    host_id: "h-1",
    name: "T",
    slug: "t",
    duration_minutes: 30,
    capacity: 1,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    minimum_notice_minutes: 0,
    booking_horizon_days: 60,
    created_at: new Date(0),
    updated_at: new Date(0),
    ...opts,
  };
}

function host(tz = "UTC"): Host {
  return { id: "h-1", slug: "h", name: "H", timezone: tz, created_at: new Date(0), updated_at: new Date(0) };
}

const NOW = DateTime.fromISO("2024-03-09T08:00:00", { zone: "UTC" });

describe("slot generation", () => {
  it("generates 30-min slots across a 09-17 window", () => {
    const weekly: WeeklyWindow[] = [{ id: "w1", host_id: "h-1", weekday: 6, start_local_time: "09:00", end_local_time: "17:00" }];
    const slots = generateSlotsForDate(et({ duration_minutes: 30 }), "UTC", "2024-03-09", weekly, [], NOW);
    expect(slots.length).toBe(16); // 09:00 .. 16:30
    expect(slots[0]!.startsAt.toISO()).toBe("2024-03-09T09:00:00.000Z");
    expect(slots[slots.length - 1]!.startsAt.toISO()).toBe("2024-03-09T16:30:00.000Z");
  });

  it("respects buffers: first slot starts at window start + buffer_before", () => {
    const slots = generateSlotsForDate(
      et({ duration_minutes: 30, buffer_before_minutes: 10, buffer_after_minutes: 10 }),
      "UTC",
      "2024-03-09",
      [{ id: "w1", host_id: "h-1", weekday: 6, start_local_time: "09:00", end_local_time: "17:00" }],
      [],
      NOW,
    );
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0]!.startsAt.toISO()).toBe("2024-03-09T09:10:00.000Z");
    // non-overlapping incl. buffers
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i]!.startsAt.toMillis()).toBeGreaterThanOrEqual(
        slots[i - 1]!.endsAt.toMillis() + 20 * 60_000, // Ba(prev)+Bb(this)=20
      );
    }
  });

  it("supports multiple windows per day", () => {
    const weekly: WeeklyWindow[] = [
      { id: "w1", host_id: "h-1", weekday: 6, start_local_time: "09:00", end_local_time: "12:00" },
      { id: "w2", host_id: "h-1", weekday: 6, start_local_time: "13:00", end_local_time: "17:00" },
    ];
    const slots = generateSlotsForDate(et({ duration_minutes: 60 }), "UTC", "2024-03-09", weekly, [], NOW);
    // 09,10,11 (09-12) + 13,14,15,16 (13-17) = 7
    expect(slots.length).toBe(7);
  });

  it("day_off override yields no slots", () => {
    const weekly: WeeklyWindow[] = [{ id: "w1", host_id: "h-1", weekday: 6, start_local_time: "09:00", end_local_time: "17:00" }];
    const overrides: OverrideRow[] = [{ id: "o1", host_id: "h-1", local_date: "2024-03-09", override_type: "day_off", start_local_time: null, end_local_time: null }];
    const slots = generateSlotsForDate(et(), "UTC", "2024-03-09", weekly, overrides, NOW);
    expect(slots.length).toBe(0);
  });

  it("custom_hours override replaces weekly availability", () => {
    const weekly: WeeklyWindow[] = [{ id: "w1", host_id: "h-1", weekday: 6, start_local_time: "09:00", end_local_time: "17:00" }];
    const overrides: OverrideRow[] = [{ id: "o1", host_id: "h-1", local_date: "2024-03-09", override_type: "custom_hours", start_local_time: "10:00", end_local_time: "12:00" }];
    const slots = generateSlotsForDate(et({ duration_minutes: 60 }), "UTC", "2024-03-09", weekly, overrides, NOW);
    // only 10:00 and 11:00 (end 12:00)
    expect(slots.length).toBe(2);
    expect(slots[0]!.startsAt.toISO()).toBe("2024-03-09T10:00:00.000Z");
  });

  it("effectiveWindowsForDate: override takes precedence over weekly", () => {
    const weekly: WeeklyWindow[] = [{ id: "w1", host_id: "h-1", weekday: 6, start_local_time: "09:00", end_local_time: "17:00" }];
    const overrides: OverrideRow[] = [{ id: "o1", host_id: "h-1", local_date: "2024-03-09", override_type: "day_off", start_local_time: null, end_local_time: null }];
    const eff = effectiveWindowsForDate("UTC", "2024-03-09", weekly, overrides);
    expect(eff.type).toBe("none");
  });

  it("minimum notice filters too-soon slots", () => {
    const now = DateTime.fromISO("2024-03-09T09:30:00", { zone: "UTC" });
    const weekly: WeeklyWindow[] = [{ id: "w1", host_id: "h-1", weekday: 6, start_local_time: "09:00", end_local_time: "17:00" }];
    const slots = generateSlotsForDate(et({ duration_minutes: 30, minimum_notice_minutes: 60 }), "UTC", "2024-03-09", weekly, [], now);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.startsAt.toMillis()).toBeGreaterThanOrEqual(now.toMillis() + 60 * 60_000);
    }
    expect(slots[0]!.startsAt.toISO()).toBe("2024-03-09T10:30:00.000Z");
  });

  it("booking horizon excludes far-future dates", () => {
    const weekly: WeeklyWindow[] = [{ id: "w1", host_id: "h-1", weekday: 1, start_local_time: "09:00", end_local_time: "17:00" }];
    // 2024-03-09 is Saturday (weekday 6); use a Monday date 2024-03-11
    const far = generateSlotsForDate(et({ duration_minutes: 30, booking_horizon_days: 1 }), "UTC", "2024-03-11", weekly, [], NOW);
    expect(far.length).toBe(0); // beyond 1-day horizon
    const near = generateSlotsForDate(et({ duration_minutes: 30, booking_horizon_days: 30 }), "UTC", "2024-03-11", weekly, [], NOW);
    expect(near.length).toBeGreaterThan(0);
  });

  it("isValidSlotPlacement accepts a generated slot and rejects an off-grid time", () => {
    const weekly: WeeklyWindow[] = [{ id: "w1", host_id: "h-1", weekday: 6, start_local_time: "09:00", end_local_time: "17:00" }];
    const valid = "2024-03-09T09:00:00.000Z";
    const invalid = "2024-03-09T09:07:00.000Z";
    expect(isValidSlotPlacement(et({ duration_minutes: 30 }), "UTC", weekly, [], valid, NOW)).toBe(true);
    expect(isValidSlotPlacement(et({ duration_minutes: 30 }), "UTC", weekly, [], invalid, NOW)).toBe(false);
  });

  it("duration validation: 15-120 enforced by schema is consistent with generation", () => {
    // generation just uses the value; constraints are enforced at the DB/schema layer.
    const slots = generateSlotsForDate(et({ duration_minutes: 120 }), "UTC", "2024-03-09", [{ id: "w1", host_id: "h-1", weekday: 6, start_local_time: "09:00", end_local_time: "17:00" }], [], NOW);
    expect(slots.length).toBe(4); // 09,11,13,15 (120-min slots, no buffer)
  });
});
