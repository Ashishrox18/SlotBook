import { describe, expect, it } from "vitest";
import { canTransition, assertTransition, InvalidTransitionError } from "@/lib/booking/state-machine";
import type { BookingStatus } from "@/lib/types";

const ALL: BookingStatus[] = ["held", "confirmed", "cancelled", "expired"];

describe("state machine — allowed transitions", () => {
  it("held → confirmed", () => expect(canTransition("held", "confirmed")).toBe(true));
  it("held → expired", () => expect(canTransition("held", "expired")).toBe(true));
  it("held → cancelled", () => expect(canTransition("held", "cancelled")).toBe(true));
  it("confirmed → cancelled", () => expect(canTransition("confirmed", "cancelled")).toBe(true));
});

describe("state machine — forbidden transitions", () => {
  const forbidden: [BookingStatus, BookingStatus][] = [
    ["expired", "confirmed"],
    ["expired", "held"],
    ["expired", "cancelled"],
    ["cancelled", "confirmed"],
    ["cancelled", "held"],
    ["cancelled", "expired"],
    ["confirmed", "held"],
    ["confirmed", "expired"],
  ];

  for (const [from, to] of forbidden) {
    it(`${from} → ${to} is forbidden`, () => {
      expect(canTransition(from, to)).toBe(false);
    });
  }
});

describe("assertTransition throws on invalid transitions", () => {
  it("throws InvalidTransitionError for expired → confirmed", () => {
    expect(() => assertTransition("expired", "confirmed")).toThrowError(InvalidTransitionError);
  });

  it("does not throw for held → confirmed", () => {
    expect(() => assertTransition("held", "confirmed")).not.toThrow();
  });

  it("error message includes both states", () => {
    try {
      assertTransition("cancelled", "confirmed");
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as Error).message).toContain("cancelled");
      expect((e as Error).message).toContain("confirmed");
    }
  });
});
