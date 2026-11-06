"use client";

import { useState } from "react";
import { useAuthed } from "@/components/dashboard/useAuthed";

interface EventType {
  id: string;
  host_id: string;
  name: string;
  slug: string;
  duration_minutes: number;
  capacity: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_minutes: number;
  booking_horizon_days: number;
  created_at: string;
  updated_at: string;
}

const blank = {
  name: "",
  slug: "",
  duration_minutes: 30,
  capacity: 1,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  minimum_notice_minutes: 120,
  booking_horizon_days: 30,
};

const num = (v: string) => Number(v) || 0;

export default function EventTypesPage() {
  const { data, loading, error, setData } = useAuthed<{ event_types: EventType[] }>("/api/dashboard/event-types");
  const [form, setForm] = useState({ ...blank });
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setCreating(true);
    setErr(null);
    try {
      const res = await fetch("/api/dashboard/event-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (res.ok) {
        setData({ event_types: [...(data?.event_types ?? []), body] });
        setForm({ ...blank });
      } else {
        setErr(body?.error ?? "Failed");
      }
    } finally {
      setCreating(false);
    }
  }

  async function save(et: EventType, patch: Partial<EventType>) {
    const res = await fetch(`/api/dashboard/event-types/${et.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = await res.json();
      setData({ event_types: (data?.event_types ?? []).map((e) => (e.id === et.id ? updated : e)) });
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this event type and its bookings?")) return;
    await fetch(`/api/dashboard/event-types/${id}`, { method: "DELETE" });
    setData({ event_types: (data?.event_types ?? []).filter((e) => e.id !== id) });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Event types</h1>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-medium">New event type</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Input label="Slug" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} />
          <Input label="Duration (min)" value={String(form.duration_minutes)} onChange={(v) => setForm({ ...form, duration_minutes: num(v) })} />
          <Input label="Capacity" value={String(form.capacity)} onChange={(v) => setForm({ ...form, capacity: num(v) })} />
          <Input label="Buffer before" value={String(form.buffer_before_minutes)} onChange={(v) => setForm({ ...form, buffer_before_minutes: num(v) })} />
          <Input label="Buffer after" value={String(form.buffer_after_minutes)} onChange={(v) => setForm({ ...form, buffer_after_minutes: num(v) })} />
          <Input label="Min notice (min)" value={String(form.minimum_notice_minutes)} onChange={(v) => setForm({ ...form, minimum_notice_minutes: num(v) })} />
          <Input label="Horizon (days)" value={String(form.booking_horizon_days)} onChange={(v) => setForm({ ...form, booking_horizon_days: num(v) })} />
        </div>
        <button onClick={create} disabled={creating} className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {creating ? "Creating…" : "Create"}
        </button>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </div>

      <div className="mt-6 space-y-4">
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {(data?.event_types ?? []).map((et) => (
          <EventRow key={et.id} et={et} onSave={save} onDelete={() => remove(et.id)} />
        ))}
      </div>
    </div>
  );
}

function EventRow({ et, onSave, onDelete }: { et: EventType; onSave: (et: EventType, patch: Partial<EventType>) => void; onDelete: () => void }) {
  const [name, setName] = useState(et.name);
  const [slug, setSlug] = useState(et.slug);
  const [duration, setDuration] = useState(String(et.duration_minutes));
  const [capacity, setCapacity] = useState(String(et.capacity));
  const [bb, setBb] = useState(String(et.buffer_before_minutes));
  const [ba, setBa] = useState(String(et.buffer_after_minutes));
  const [mn, setMn] = useState(String(et.minimum_notice_minutes));
  const [hz, setHz] = useState(String(et.booking_horizon_days));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input label="Name" value={name} onChange={setName} />
        <Input label="Slug" value={slug} onChange={setSlug} />
        <Input label="Duration" value={duration} onChange={setDuration} />
        <Input label="Capacity" value={capacity} onChange={setCapacity} />
        <Input label="Buffer before" value={bb} onChange={setBb} />
        <Input label="Buffer after" value={ba} onChange={setBa} />
        <Input label="Min notice" value={mn} onChange={setMn} />
        <Input label="Horizon" value={hz} onChange={setHz} />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onSave(et, {
            name, slug, duration_minutes: num(duration), capacity: num(capacity),
            buffer_before_minutes: num(bb), buffer_after_minutes: num(ba),
            minimum_notice_minutes: num(mn), booking_horizon_days: num(hz),
          })}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Save
        </button>
        <button onClick={onDelete} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
          Delete
        </button>
      </div>
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
    </div>
  );
}
