"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import type { BookingDetail } from "@/lib/booking/queries";

interface SlotDTO {
  starts_at: string;
  starts_at_local: string;
  available: boolean;
  remaining_capacity: number;
}

function fmt(iso: string, zone: string) {
  return DateTime.fromISO(iso, { zone: "UTC" }).setZone(zone).toFormat("ccc, MMM d yyyy, h:mm a ZZZZ");
}

export default function ManageBooking({ booking, token }: { booking: BookingDetail; token: string }) {
  const router = useRouter();
  const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone || booking.host_timezone;

  const [rescheduleDate, setRescheduleDate] = useState("");
  const [slots, setSlots] = useState<SlotDTO[]>([]);
  const [newStartsAt, setNewStartsAt] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmed = booking.status === "confirmed";

  async function loadSlots(date: string) {
    setRescheduleDate(date);
    setNewStartsAt(null);
    if (!date) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    try {
      const params = new URLSearchParams({ from: date, to: date, tz: viewerTz });
      const res = await fetch(`/api/hosts/${booking.host_slug}/events/${booking.event_slug}/slots?${params}`);
      const data = (await res.json()) as { slots: SlotDTO[] };
      setSlots((data.slots ?? []).filter((s) => s.available));
    } finally {
      setLoadingSlots(false);
    }
  }

  async function doReschedule() {
    if (!newStartsAt) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/bookings/${token}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starts_at: newStartsAt }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg("Rescheduled successfully.");
        router.refresh();
      } else {
        setMsg(data?.error ?? "Could not reschedule.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function doCancel() {
    if (!cancelReason.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/bookings/${token}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancellation_reason: cancelReason }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg("Booking cancelled.");
        router.refresh();
      } else {
        setMsg(data?.error ?? "Could not cancel.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-sm text-brand-600">{booking.host_name}</p>
      <h1 className="text-2xl font-semibold tracking-tight">{booking.event_name}</h1>
      <p className="mt-1 text-sm text-slate-500">{booking.duration_minutes} min · capacity {booking.capacity}</p>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-sm">
        <Row label="Status" value={<StatusBadge status={booking.status} />} />
        <Row label="Start (host)" value={fmt(booking.starts_at, booking.host_timezone)} />
        <Row label="Start (your time)" value={fmt(booking.starts_at, viewerTz)} />
        <Row label="End (host)" value={fmt(booking.ends_at, booking.host_timezone)} />
        {booking.guest_name && <Row label="Guest" value={booking.guest_name} />}
        {booking.cancellation_reason && <Row label="Cancellation reason" value={booking.cancellation_reason} />}
      </div>

      {msg && <p className="mt-4 text-sm text-slate-700">{msg}</p>}

      {confirmed && (
        <div className="mt-8 space-y-8">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-medium">Reschedule</h2>
            <p className="mt-1 text-xs text-slate-500">
              Rescheduling is atomic — your booking only moves once the new slot has capacity.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <label htmlFor="rdate" className="text-sm text-slate-600">
                Date
              </label>
              <input
                id="rdate"
                type="date"
                value={rescheduleDate}
                onChange={(e) => void loadSlots(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              />
            </div>
            {loadingSlots && <p className="mt-2 text-sm text-slate-500">Loading…</p>}
            {!loadingSlots && slots.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {slots.map((s) => (
                  <button
                    key={s.starts_at}
                    data-testid={`reschedule-slot-${s.starts_at}`}
                    onClick={() => setNewStartsAt(s.starts_at)}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      newStartsAt === s.starts_at
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-slate-200 hover:border-brand-400"
                    }`}
                  >
                    {s.starts_at_local.slice(11, 16)}
                    {booking.capacity > 1 && <span className="ml-1 text-xs text-slate-400">{s.remaining_capacity} left</span>}
                  </button>
                ))}
              </div>
            )}
            {!loadingSlots && rescheduleDate && slots.length === 0 && (
              <p className="mt-3 text-sm text-slate-500">No available slots on that day.</p>
            )}
            <button
              disabled={!newStartsAt || busy}
              onClick={doReschedule}
              data-testid="reschedule"
              className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? "Working…" : "Reschedule"}
            </button>
          </section>

          <section className="rounded-xl border border-red-200 bg-white p-5">
            <h2 className="font-medium text-red-700">Cancel booking</h2>
            <textarea
              id="cancel-reason"
              placeholder="Reason (required)"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={2}
            />
            <button
              disabled={!cancelReason.trim() || busy}
              onClick={doCancel}
              data-testid="cancel-booking"
              className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              {busy ? "Working…" : "Cancel booking"}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-900">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    held: "bg-amber-100 text-amber-800",
    confirmed: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-slate-200 text-slate-700",
    expired: "bg-red-100 text-red-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-slate-100"}`}>{status}</span>;
}
