"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { useAuthed } from "@/components/dashboard/useAuthed";

interface Booking {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  guest_name: string | null;
  guest_email: string | null;
  management_token: string | null;
  event_name: string;
  event_slug: string;
}

export default function DashboardBookingsPage() {
  const { data, loading, error, setData } = useAuthed<{ bookings: Booking[] }>("/api/dashboard/bookings");

  async function cancel(id: string, reason: string) {
    const res = await fetch(`/api/dashboard/bookings/${id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancellation_reason: reason }),
    });
    if (res.ok) {
      setData({ bookings: (data?.bookings ?? []).filter((b) => b.id !== id) });
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Upcoming bookings</h1>
      <p className="mt-1 text-sm text-slate-500">Active (held/confirmed) bookings from now on. Times shown in your timezone.</p>

      <div className="mt-6 space-y-3">
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {(data?.bookings ?? []).length === 0 && !loading && (
          <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No upcoming bookings.
          </p>
        )}
        {(data?.bookings ?? []).map((b) => (
          <BookingRow key={b.id} booking={b} onCancel={cancel} />
        ))}
      </div>
    </div>
  );
}

function BookingRow({ booking, onCancel }: { booking: Booking; onCancel: (id: string, reason: string) => void }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const start = DateTime.fromISO(booking.starts_at, { zone: "UTC" }).setZone(tz).toFormat("ccc, MMM d, h:mm a");
  const [reason, setReason] = useState("");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{booking.event_name}</p>
          <p className="text-sm text-slate-500">{start}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${booking.status === "confirmed" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {booking.status}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {booking.guest_name ?? "—"} · {booking.guest_email ?? "—"}
      </p>
      {booking.management_token && (
        <a href={`/bookings/${booking.management_token}`} className="mt-1 inline-block text-xs text-brand-600 hover:underline">
          View booking page →
        </a>
      )}
      {booking.status === "confirmed" && (
        <div className="mt-3 flex items-center gap-2">
          <input
            placeholder="Cancellation reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm"
          />
          <button
            disabled={!reason.trim()}
            onClick={() => onCancel(booking.id, reason)}
            className="rounded-lg border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
