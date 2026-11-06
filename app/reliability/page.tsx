"use client";

import { useEffect, useState } from "react";

interface Health {
  status: string;
  database: string;
  server_time?: string;
  error?: string;
}

interface Metrics {
  counters: Record<string, number>;
  bookings_by_status: Record<string, number>;
  notifications_by_type: Record<string, number>;
}

export default function ReliabilityPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [h, m] = await Promise.all([
        fetch("/api/health").then((r) => r.json() as Promise<Health>),
        fetch("/api/metrics").then((r) => r.json() as Promise<Metrics>),
      ]);
      setHealth(h);
      setMetrics(m);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Reliability</h1>
      <p className="mt-1 text-sm text-slate-500">
        The invisible engineering, made visible. Booking correctness lives in PostgreSQL, not in caches or locks.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-medium text-slate-700">Database health</h2>
          {loading || !health ? (
            <p className="mt-2 text-sm text-slate-500">Checking…</p>
          ) : (
            <div className="mt-2 text-sm">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${health.status === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>
                {health.database}
              </span>
              {health.server_time && (
                <p className="mt-2 text-xs text-slate-500">server time: {new Date(health.server_time).toISOString()}</p>
              )}
              {health.error && <p className="mt-2 text-xs text-red-600">{health.error}</p>}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-medium text-slate-700">Bookings by status</h2>
          <div className="mt-2 space-y-1 text-sm">
            {metrics ? (
              Object.entries(metrics.bookings_by_status).length === 0 ? (
                <p className="text-slate-500">none yet</p>
              ) : (
                Object.entries(metrics.bookings_by_status).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-slate-600">{k}</span><span>{v}</span></div>
                ))
              )
            ) : <p className="text-slate-500">Loading…</p>}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-medium text-slate-700">Notification events</h2>
          <div className="mt-2 space-y-1 text-sm">
            {metrics ? (
              Object.entries(metrics.notifications_by_type).length === 0 ? (
                <p className="text-slate-500">none yet</p>
              ) : (
                Object.entries(metrics.notifications_by_type).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-slate-600">{k}</span><span>{v}</span></div>
                ))
              )
            ) : <p className="text-slate-500">Loading…</p>}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-medium text-slate-700">Lifecycle counters (since start)</h2>
          <div className="mt-2 space-y-1 text-sm">
            {metrics ? (
              Object.entries(metrics.counters).length === 0 ? (
                <p className="text-slate-500">none yet</p>
              ) : (
                Object.entries(metrics.counters).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-slate-600">{k}</span><span>{v}</span></div>
                ))
              )
            ) : <p className="text-slate-500">Loading…</p>}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        <h2 className="font-medium text-slate-900">How capacity is protected</h2>
        <p className="mt-2">
          Every hold creation runs in a single PostgreSQL transaction that first takes a transaction-level
          advisory lock keyed by (event type, slot start). That serializes concurrent attempts for the
          <em> same</em> slot, so the sequence <em>expire stale holds → count active → insert</em> is race-free.
          Different slots run in parallel. The guarantee <code className="rounded bg-slate-100 px-1">active_count ≤ capacity</code>{" "}
          holds under any number of concurrent requests, retries, or restarts — because it is enforced by the
          database, not application memory.
        </p>
        <p className="mt-2">
          Holds expire by authoritative server time; expired holds stop consuming capacity even if the app
          restarts. Reschedules move a booking atomically — it is never cancelled before the new slot is
          confirmed to have capacity.
        </p>
      </div>
    </div>
  );
}
