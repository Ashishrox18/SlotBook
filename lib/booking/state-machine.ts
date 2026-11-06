import type { BookingStatus } from "../types";

/**
 * Booking lifecycle state machine.
 *
 * HELD ──→ CONFIRMED
 *   │           │
 *   │           └──→ CANCELLED
 *   │
 *   └──→ EXPIRED
 *
 * All other transitions are invalid.
 *
 * Application logic calls `assertTransition` before mutating status.
 * The database CHECK constraint on `bookings.status` is a second line of defence
 * (it prevents impossible states regardless of what the app does).
 *
 * The machine is intentionally strict:
 * - EXPIRED → CONFIRMED is impossible (hold expired, must re-book)
 * - CANCELLED → CONFIRMED is impossible (booking is done)
 * - CONFIRMED → HELD is impossible (no regression)
 */

type Transition = `${BookingStatus}->${BookingStatus}`;

const ALLOWED: Set<Transition> = new Set([
  "held->confirmed",
  "held->expired",
  "held->cancelled",
  "confirmed->cancelled",
]);

export class InvalidTransitionError extends Error {
  constructor(from: BookingStatus, to: BookingStatus) {
    super(
      `Invalid booking transition: ${from} → ${to}. ` +
        `Allowed transitions from ${from}: ${allowedFrom(from).join(", ") || "none"}.`,
    );
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED.has(`${from}->${to}`);
}

/**
 * Assert that a transition is legal.
 * Throws `InvalidTransitionError` if it is not.
 * Use before any UPDATE that changes `status`.
 */
export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

function allowedFrom(from: BookingStatus): BookingStatus[] {
  return (Array.from(ALLOWED) as Transition[])
    .filter((t) => t.startsWith(`${from}->`))
    .map((t) => t.split("->")[1] as BookingStatus);
}
