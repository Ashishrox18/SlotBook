import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Slotbook</h1>
      <p className="mt-4 text-lg text-slate-600">
        A scheduling platform where the hard part is correctness, not the calendar. Holds, capacity,
        expiry, rescheduling, and notifications are all protected by PostgreSQL transactions — so a
        slot is never overbooked, even under concurrent requests, retries, or lost responses.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          href="/alex-morgan/intro-15"
          className="rounded-xl border border-slate-200 bg-white p-6 hover:border-brand-400 hover:shadow-sm transition"
        >
          <h2 className="font-medium">Book a slot →</h2>
          <p className="mt-1 text-sm text-slate-500">Try the guest flow: pick a slot, get a 5-minute hold, confirm.</p>
        </Link>
        <Link
          href="/dashboard/login"
          className="rounded-xl border border-slate-200 bg-white p-6 hover:border-brand-400 hover:shadow-sm transition"
        >
          <h2 className="font-medium">Host dashboard →</h2>
          <p className="mt-1 text-sm text-slate-500">Manage event types, availability, overrides, and bookings.</p>
        </Link>
        <Link
          href="/reliability"
          className="rounded-xl border border-slate-200 bg-white p-6 hover:border-brand-400 hover:shadow-sm transition"
        >
          <h2 className="font-medium">Reliability demo →</h2>
          <p className="mt-1 text-sm text-slate-500">See database health, events, and how capacity is protected.</p>
        </Link>
        <Link
          href="/notifications"
          className="rounded-xl border border-slate-200 bg-white p-6 hover:border-brand-400 hover:shadow-sm transition"
        >
          <h2 className="font-medium">Notification outbox →</h2>
          <p className="mt-1 text-sm text-slate-500">Committed lifecycle events, transactionally recorded.</p>
        </Link>
      </div>
    </div>
  );
}
