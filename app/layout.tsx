import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slotbook — reliable scheduling",
  description: "A scheduling platform where bookings are correct, not just rendered. PostgreSQL is the source of truth.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight">
              Slotbook
            </Link>
            <nav className="flex items-center gap-4 text-sm text-slate-600">
              <Link href="/alex-morgan/intro-15" className="hover:text-slate-900">Book</Link>
              <Link href="/dashboard" className="hover:text-slate-900">Dashboard</Link>
              <Link href="/notifications" className="hover:text-slate-900">Notifications</Link>
              <Link href="/reliability" className="hover:text-slate-900">Reliability</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-6 text-xs text-slate-500">
            Slotbook — PostgreSQL is the source of truth for booking correctness.
          </div>
        </footer>
      </body>
    </html>
  );
}
