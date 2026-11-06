import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-col gap-6 sm:flex-row">
        <aside className="sm:w-48 sm:flex-none">
          <h2 className="text-sm font-semibold text-slate-900">Dashboard</h2>
          <nav className="mt-3 flex flex-row flex-wrap gap-2 text-sm sm:flex-col sm:gap-1">
            <Link href="/dashboard" className="rounded-lg px-2 py-1 hover:bg-slate-100">Overview</Link>
            <Link href="/dashboard/event-types" className="rounded-lg px-2 py-1 hover:bg-slate-100">Event types</Link>
            <Link href="/dashboard/availability" className="rounded-lg px-2 py-1 hover:bg-slate-100">Availability</Link>
            <Link href="/dashboard/overrides" className="rounded-lg px-2 py-1 hover:bg-slate-100">Overrides</Link>
            <Link href="/dashboard/bookings" className="rounded-lg px-2 py-1 hover:bg-slate-100">Bookings</Link>
            <Link href="/dashboard/settings" className="rounded-lg px-2 py-1 hover:bg-slate-100">Settings</Link>
          </nav>
        </aside>
        <section className="flex-1">{children}</section>
      </div>
    </div>
  );
}
