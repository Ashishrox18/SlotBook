"use client";

import { useState } from "react";
import { useAuthed } from "@/components/dashboard/useAuthed";

interface Override {
  id: string;
  local_date: string;
  override_type: "day_off" | "custom_hours";
  start_local_time: string | null;
  end_local_time: string | null;
}

export default function OverridesPage() {
  const { data, loading, error, setData } = useAuthed<{ overrides: Override[] }>("/api/dashboard/overrides");
  const [date, setDate] = useState("");
  const [type, setType] = useState<"day_off" | "custom_hours">("day_off");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const res = await fetch("/api/dashboard/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          local_date: date,
          override_type: type,
          start_local_time: type === "custom_hours" ? start : null,
          end_local_time: type === "custom_hours" ? end : null,
        }),
      });
      const body = await res.json();
      if (res.ok) setData({ overrides: [...(data?.overrides ?? []), body].sort((a, b) => a.local_date.localeCompare(b.local_date)) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/dashboard/overrides/${id}`, { method: "DELETE" });
    setData({ overrides: (data?.overrides ?? []).filter((o) => o.id !== id) });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Date overrides</h1>
      <p className="mt-1 text-sm text-slate-500">Overrides take precedence over weekly availability for that date.</p>

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <label className="text-xs font-medium text-slate-600">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as "day_off" | "custom_hours")} className="mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="day_off">Day off</option>
            <option value="custom_hours">Custom hours</option>
          </select>
        </div>
        {type === "custom_hours" && (
          <>
            <div>
              <label className="text-xs font-medium text-slate-600">Start</label>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">End</label>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
            </div>
          </>
        )}
        <button onClick={add} disabled={busy || !date} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? "Adding…" : "Add override"}
        </button>
      </div>

      <div className="mt-6 space-y-2">
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {(data?.overrides ?? []).map((o) => (
          <div key={o.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <div>
              <span className="font-medium">{o.local_date}</span>{" "}
              <span className="text-slate-500">
                {o.override_type === "day_off" ? "Day off" : `Custom hours ${o.start_local_time?.slice(0, 5)}–${o.end_local_time?.slice(0, 5)}`}
              </span>
            </div>
            <button onClick={() => remove(o.id)} className="text-xs text-red-600 hover:underline">remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
