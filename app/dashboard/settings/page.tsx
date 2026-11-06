"use client";

import { useState } from "react";
import { useAuthed } from "@/components/dashboard/useAuthed";

const ZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Asia/Kolkata", "Asia/Tokyo", "Asia/Singapore",
  "Australia/Sydney", "Pacific/Auckland",
];

interface HostInfo {
  id: string;
  slug: string;
  name: string;
  timezone: string;
}

export default function SettingsPage() {
  const { data, loading, error } = useAuthed<HostInfo>("/api/dashboard/host");
  const [name, setName] = useState("");
  const [tz, setTz] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (data && !loaded) {
    setName(data.name);
    setTz(data.timezone);
    setLoaded(true);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/dashboard/host", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, timezone: tz }),
      });
      setMsg(res.ok ? "Saved." : "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">Host settings</h1>
      <div className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <label className="text-sm font-medium text-slate-600">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-600">Home timezone (IANA)</label>
          <input list="tzlist" value={tz} onChange={(e) => setTz(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <datalist id="tzlist">
            {ZONES.map((z) => <option key={z} value={z} />)}
          </datalist>
          <p className="mt-1 text-xs text-slate-500">Availability is interpreted in this timezone.</p>
        </div>
        <button onClick={save} disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        {msg && <p className="text-sm text-slate-700">{msg}</p>}
      </div>
    </div>
  );
}
