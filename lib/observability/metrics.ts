/** Lightweight in-memory counters since process start. Resets on restart. */
const counters = new Map<string, number>();

export function inc(name: string, by = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

export function metricsSnapshot(): Record<string, number> {
  return Object.fromEntries(counters);
}

export function resetMetrics(): void {
  counters.clear();
}

export const METRICS = {
  holdsCreated: "holds_created",
  holdsExpired: "holds_expired",
  bookingsConfirmed: "bookings_confirmed",
  bookingsCancelled: "bookings_cancelled",
  bookingsRescheduled: "bookings_rescheduled",
  notificationsCreated: "notifications_created",
} as const;
