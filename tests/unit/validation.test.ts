import { describe, expect, it } from "vitest";
import {
  CreateHoldSchema,
  ConfirmHoldSchema,
  CancelSchema,
  RescheduleSchema,
  EventTypeCreateSchema,
  WeeklyAvailabilitySchema,
  OverrideSchema,
  HostSettingsSchema,
} from "@/lib/validation/schemas";

const ok = (s: { safeParse: (x: unknown) => { success: boolean } }, data: unknown) => s.safeParse(data).success;

describe("public payload validation", () => {
  it("CreateHoldSchema accepts valid input and rejects bad uuid / bad ISO", () => {
    expect(ok(CreateHoldSchema, { event_type_id: "550e8400-e29b-41d4-a716-446655440000", starts_at: "2024-03-09T09:00:00.000Z" })).toBe(true);
    expect(ok(CreateHoldSchema, { event_type_id: "not-a-uuid", starts_at: "2024-03-09T09:00:00.000Z" })).toBe(false);
    expect(ok(CreateHoldSchema, { event_type_id: "550e8400-e29b-41d4-a716-446655440000", starts_at: "2024-03-09 09:00" })).toBe(false);
    expect(ok(CreateHoldSchema, { event_type_id: "550e8400-e29b-41d4-a716-446655440000" })).toBe(false);
  });

  it("ConfirmHoldSchema validates email", () => {
    expect(ok(ConfirmHoldSchema, { guest_name: "A", guest_email: "a@b.com" })).toBe(true);
    expect(ok(ConfirmHoldSchema, { guest_name: "A", guest_email: "nope" })).toBe(false);
  });

  it("CancelSchema requires a reason", () => {
    expect(ok(CancelSchema, { cancellation_reason: "conflict" })).toBe(true);
    expect(ok(CancelSchema, { cancellation_reason: "" })).toBe(false);
  });

  it("RescheduleSchema requires a valid ISO instant", () => {
    expect(ok(RescheduleSchema, { starts_at: "2024-03-09T09:00:00.000Z" })).toBe(true);
    expect(ok(RescheduleSchema, { starts_at: "2024-03-09" })).toBe(false);
  });
});

describe("event type constraints", () => {
  const base = {
    name: "Intro", slug: "intro-15", duration_minutes: 30, capacity: 1,
    buffer_before_minutes: 0, buffer_after_minutes: 0, minimum_notice_minutes: 0, booking_horizon_days: 30,
  };
  it("duration must be 15..120", () => {
    expect(ok(EventTypeCreateSchema, { ...base, duration_minutes: 15 })).toBe(true);
    expect(ok(EventTypeCreateSchema, { ...base, duration_minutes: 120 })).toBe(true);
    expect(ok(EventTypeCreateSchema, { ...base, duration_minutes: 14 })).toBe(false);
    expect(ok(EventTypeCreateSchema, { ...base, duration_minutes: 121 })).toBe(false);
  });
  it("capacity must be >= 1", () => {
    expect(ok(EventTypeCreateSchema, { ...base, capacity: 1 })).toBe(true);
    expect(ok(EventTypeCreateSchema, { ...base, capacity: 0 })).toBe(false);
  });
  it("buffers must be 0..30", () => {
    expect(ok(EventTypeCreateSchema, { ...base, buffer_before_minutes: 30 })).toBe(true);
    expect(ok(EventTypeCreateSchema, { ...base, buffer_before_minutes: 31 })).toBe(false);
    expect(ok(EventTypeCreateSchema, { ...base, buffer_after_minutes: -1 })).toBe(false);
  });
  it("slug must be lowercase/digits/hyphens", () => {
    expect(ok(EventTypeCreateSchema, { ...base, slug: "office-hours" })).toBe(true);
    expect(ok(EventTypeCreateSchema, { ...base, slug: "Office Hours" })).toBe(false);
  });
});

describe("weekly availability + overrides", () => {
  it("window requires end > start", () => {
    expect(ok(WeeklyAvailabilitySchema, { weekday: 1, start_local_time: "09:00", end_local_time: "17:00" })).toBe(true);
    expect(ok(WeeklyAvailabilitySchema, { weekday: 1, start_local_time: "17:00", end_local_time: "09:00" })).toBe(false);
  });
  it("weekday must be 0..6", () => {
    expect(ok(WeeklyAvailabilitySchema, { weekday: 7, start_local_time: "09:00", end_local_time: "17:00" })).toBe(false);
  });
  it("custom_hours override requires times", () => {
    expect(ok(OverrideSchema, { local_date: "2024-03-09", override_type: "day_off", start_local_time: null, end_local_time: null })).toBe(true);
    expect(ok(OverrideSchema, { local_date: "2024-03-09", override_type: "custom_hours", start_local_time: null, end_local_time: null })).toBe(false);
    expect(ok(OverrideSchema, { local_date: "2024-03-09", override_type: "custom_hours", start_local_time: "09:00", end_local_time: "12:00" })).toBe(true);
    expect(ok(OverrideSchema, { local_date: "2024-03-09", override_type: "custom_hours", start_local_time: "12:00", end_local_time: "09:00" })).toBe(false);
  });
});

describe("host settings", () => {
  it("accepts a valid IANA zone and rejects junk", () => {
    expect(ok(HostSettingsSchema, { name: "Alex", timezone: "America/New_York" })).toBe(true);
    expect(ok(HostSettingsSchema, { name: "Alex", timezone: "not-a-zone" })).toBe(false);
  });
});
