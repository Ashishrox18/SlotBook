"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";

interface Event {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
}

const COLORS: Record<string, string> = {
  "booking.confirmed": "bg-emerald-100 text-emerald-800",
  "booking.rescheduled": "bg-amber-100 text-amber-800",
  "booking.cancelled": "bg-red-100 text-red-700",
};

export default function NotificationsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/notifications");
        const data = (await res.json()) as { events: Event[] };
        if (active) setEvents(data.events ?? []);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Notification outbox</h1>
      <p className="mt-1 text-sm text-slate-500">
        Lifecycle events are written in the same transaction as the booking change, so they are never lost
        if the transition rolls back. Guest email is redacted here.
      </p>

      <div className="mt-6 space-y-2">
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {!loading && events.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No notification events yet. Confirm or cancel a booking to see one appear here.
          </p>
        )}
        {events.map((e) => {
          const p = e.payload as { starts_at?: string; previous_starts_at?: string; cancellation_reason?: string };
          return (
            <div key={e.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLORS[e.event_type] ?? "bg-slate-100"}`}>
                  {e.event_type}
                </span>
                <span className="text-xs text-slate-400">
                  {DateTime.fromISO(e.created_at, { zone: "UTC" }).toLocal().toFormat("MMM d, h:mm:ss a")}
                </span>
              </div>
              <p className="mt-2 text-slate-600">
                starts_at: {p.starts_at ? DateTime.fromISO(p.starts_at, { zone: "UTC" }).toLocal().toFormat("ccc, MMM d h:mm a") : "—"}
                {p.previous_starts_at && (
                  <> · moved from {DateTime.fromISO(p.previous_starts_at, { zone: "UTC" }).toLocal().toFormat("ccc, MMM d h:mm a")}</>
                )}
                {p.cancellation_reason && <> · reason: {p.cancellation_reason}</>}
              </p>
              <p className="mt-1 text-xs text-slate-400">status: {e.status}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
