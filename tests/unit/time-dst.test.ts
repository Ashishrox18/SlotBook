import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { localToUtc, weekdayDbFromIsoDate, isValidZone, formatInZone } from "@/lib/time";

describe("timezone conversion", () => {
  it("converts host-local wall clock to UTC before DST (EST = UTC-5)", () => {
    // 2024-03-08 is before the US DST transition (still EST)
    const utc = localToUtc("America/New_York", "2024-03-08", "09:00");
    expect(utc.toISO()).toBe("2024-03-08T14:00:00.000Z");
  });

  it("converts host-local wall clock to UTC after DST (EDT = UTC-4)", () => {
    // 2024-03-11 is after the US DST transition (now EDT)
    const utc = localToUtc("America/New_York", "2024-03-11", "09:00");
    expect(utc.toISO()).toBe("2024-03-11T13:00:00.000Z");
  });

  it("the same host wall-clock slot maps to different UTC instants across DST", () => {
    const before = localToUtc("America/New_York", "2024-03-08", "09:00"); // 14:00Z
    const after = localToUtc("America/New_York", "2024-03-11", "09:00"); // 13:00Z
    // 3 calendar days pass, but DST steals one hour, so UTC advances 71h not 72h.
    expect(after.toMillis() - before.toMillis()).toBe(3600_000 * 24 * 3 - 3600_000);
  });
});

describe("guest views the slot in another timezone", () => {
  it("shows a NY 09:00 EDT slot correctly in Asia/Kolkata", () => {
    const nySlotUtcIso = "2024-03-11T13:00:00.000Z"; // 09:00 EDT
    const inKolkata = DateTime.fromISO(nySlotUtcIso, { zone: "UTC" }).setZone("Asia/Kolkata");
    // Kolkata is UTC+5:30 → 18:30
    expect(inKolkata.toFormat("HH:mm")).toBe("18:30");
  });

  it("formatInZone renders the instant in the requested zone", () => {
    const iso = "2024-03-11T13:00:00.000Z";
    expect(formatInZone(iso, "America/New_York", "HH:mm ZZZZ")).toContain("09:00");
  });
});

describe("weekday helpers", () => {
  it("weekdayDbFromIsoDate maps Monday to 1 and Sunday to 0", () => {
    expect(weekdayDbFromIsoDate("2024-03-11")).toBe(1); // Monday
    expect(weekdayDbFromIsoDate("2024-03-10")).toBe(0); // Sunday
  });
});

describe("zone validation", () => {
  it("accepts valid IANA zones and rejects junk", () => {
    expect(isValidZone("America/New_York")).toBe(true);
    expect(isValidZone("Asia/Kolkata")).toBe(true);
    expect(isValidZone("not/a/zone")).toBe(false);
  });
});
