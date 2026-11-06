"use client";

import { useState } from "react";
import { useAuthed } from "@/components/dashboard/useAuthed";

interface Window {
  id: string;
  host_id: string;
  weekday: number;
  start_local_time: string;
  end_local_time: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function AvailabilityPage() {
  const { data, loading, error, setData } = useAuthed<{ availability: Window[] }>("/api/dashboard/availability");
  const [weekday, setWeekday] = useState("1");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const res = await fetch("/api/dashboard/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekday: Number(weekday), start_local_time: start, end_local_time: end }),
      });
      const body = await res.json();
      if (res.ok) setData({ availability: [...(data?.availability ?? []), body] });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/dashboard/availability/${id}`, { method: "DELETE" });
    setData({ availability: (data?.availability ?? []).filter((w) => w.id !== id) });
  }

  const grouped = (data?.availability ?? []).reduce<Record<number, Window[]>>((acc, w) => {
    (acc[w.weekday] ??= []).push(w);
    return acc;
  }, {});

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Weekly availability</h1>
      <p className="mt-1 text-sm text-slate-500">Times are wall-clock in the host timezone. Multiple windows per day are supported.</p>

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <label className="text-xs font-medium text-slate-600">Weekday</label>
          <select value={weekday} onChange={(e) => setWeekday(e.target.value)} className="mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Start</label>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">End</label>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        </div>
        <button onClick={add} disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? "Adding…" : "Add window"}
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {DAYS.map((day, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-medium text-slate-700">{day}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {(grouped[i] ?? []).length === 0 && <span className="text-sm text-slate-400">Unavailable</span>}
              {(grouped[i] ?? []).map((w) => (
                <span key={w.id} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm">
                  {w.start_local_time.slice(0, 5)} — {w.end_local_time.slice(0, 5)}
                  <button onClick={() => remove(w.id)} className="text-xs text-red-600 hover:underline">remove</button>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
