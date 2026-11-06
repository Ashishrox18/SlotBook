"use client";

import Link from "next/link";
import { useAuthed } from "@/components/dashboard/useAuthed";

interface HostInfo {
  id: string;
  slug: string;
  name: string;
  timezone: string;
}

export default function DashboardHome() {
  const { data, loading, error } = useAuthed<HostInfo>("/api/dashboard/host");

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return null;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {data.name}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Slug <code className="rounded bg-slate-100 px-1">{data.slug}</code> · Timezone {data.timezone}
      </p>
      <p className="mt-1 text-sm text-slate-500">
        Public booking link:{" "}
        <code className="rounded bg-slate-100 px-1">/{data.slug}/intro-15</code>
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card href="/dashboard/event-types" title="Event types" desc="Create and configure what guests can book." />
        <Card href="/dashboard/availability" title="Weekly availability" desc="Set recurring windows per weekday." />
        <Card href="/dashboard/overrides" title="Date overrides" desc="Days off and custom hours." />
        <Card href="/dashboard/bookings" title="Upcoming bookings" desc="See and cancel scheduled bookings." />
      </div>
    </div>
  );
}

function Card({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="rounded-xl border border-slate-200 bg-white p-5 hover:border-brand-400 hover:shadow-sm transition">
      <h2 className="font-medium">{title} →</h2>
      <p className="mt-1 text-sm text-slate-500">{desc}</p>
    </Link>
  );
}
