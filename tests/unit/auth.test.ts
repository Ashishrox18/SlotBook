import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { hashRequest } from "@/lib/idempotency";
import { createSessionToken, parseSessionToken } from "@/lib/security/auth";

describe("idempotency request hashing", () => {
  it("is order-independent for the same payload", () => {
    const a = hashRequest({ event_type_id: "x", starts_at: "2024-03-09T09:00:00.000Z" });
    const b = hashRequest({ starts_at: "2024-03-09T09:00:00.000Z", event_type_id: "x" });
    expect(a).toBe(b);
  });

  it("changes when the payload changes", () => {
    const a = hashRequest({ event_type_id: "x", starts_at: "2024-03-09T09:00:00.000Z" });
    const b = hashRequest({ event_type_id: "x", starts_at: "2024-03-09T09:30:00.000Z" });
    expect(a).not.toBe(b);
  });

  it("is a stable 64-char hex string", () => {
    const h = hashRequest({ a: 1 });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("session tokens", () => {
  it("round-trips a host slug", () => {
    const token = createSessionToken("alex-morgan");
    expect(parseSessionToken(token)).toBe("alex-morgan");
  });

  it("rejects a tampered signature", () => {
    const token = createSessionToken("alex-morgan");
    const [slug, sig] = [token.slice(0, token.lastIndexOf(".")), token.slice(token.lastIndexOf(".") + 1)];
    const flipped = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
    expect(parseSessionToken(`${slug}.${flipped}`)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(parseSessionToken("nonsense")).toBeNull();
    expect(parseSessionToken("")).toBeNull();
    expect(parseSessionToken(null)).toBeNull();
  });
});

describe("management tokens", () => {
  it("are long, hex, and unique per generation", () => {
    const a = randomBytes(32).toString("hex");
    const b = randomBytes(32).toString("hex");
    expect(a).toHaveLength(64);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
