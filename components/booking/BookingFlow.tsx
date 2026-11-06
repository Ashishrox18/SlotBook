"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import ConfidenceTimeline from "./ConfidenceTimeline";

interface SlotDTO {
  starts_at: string;
  starts_at_local: string;
  end_at_local: string;
  available: boolean;
  remaining_capacity: number;
}

type Phase = "browsing" | "holding" | "confirming" | "confirmed" | "expired";

const COMMON_ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

interface Props {
  hostSlug: string;
  hostName: string;
  hostTimezone: string;
  eventName: string;
  eventSlug: string;
  eventTypeId: string;
  durationMinutes: number;
  capacity: number;
}

function detectTz(): string {
  const t = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return t && t.length > 0 ? t : "UTC";
}

export default function BookingFlow(props: Props) {
  const { hostSlug, hostName, hostTimezone, eventName, eventSlug, eventTypeId, durationMinutes, capacity } = props;

  const [viewerTz, setViewerTz] = useState<string>(() => detectTz());
  const [slots, setSlots] = useState<SlotDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("browsing");
  const [hold, setHold] = useState<{ id: string; hold_expires_at: string } | null>(null);
  const [selectedStartsAt, setSelectedStartsAt] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [managementUrl, setManagementUrl] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSlots = useCallback(
    async (tz: string) => {
      setLoading(true);
      setError(null);
      try {
        const hostToday = DateTime.now().setZone(hostTimezone).startOf("day");
        const from = hostToday.toISODate()!;
        const to = hostToday.plus({ days: 14 }).toISODate()!;
        const params = new URLSearchParams({ from, to, tz });
        const res = await fetch(`/api/hosts/${hostSlug}/events/${eventSlug}/slots?${params}`);
        if (!res.ok) throw new Error("Could not load slots");
        const data = (await res.json()) as { slots: SlotDTO[] };
        setSlots(data.slots ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load availability");
        setSlots([]);
      } finally {
        setLoading(false);
      }
    },
    [hostSlug, eventSlug, hostTimezone],
  );

  useEffect(() => {
    void fetchSlots(viewerTz);
  }, [viewerTz, fetchSlots]);

  // Countdown — UX only; the server remains authoritative.
  useEffect(() => {
    if (phase !== "holding" || !hold) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    const tick = () => {
      const ms = new Date(hold.hold_expires_at).getTime() - Date.now();
      const s = Math.floor(ms / 1000);
      setRemaining(Math.max(0, s));
      if (ms <= 0) {
        setPhase("expired");
        if (timerRef.current) clearInterval(timerRef.current);
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, hold]);

  const grouped = useMemo(() => {
    const map = new Map<string, SlotDTO[]>();
    for (const s of slots) {
      const date = s.starts_at_local.slice(0, 10);
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(s);
    }
    return Array.from(map.entries());
  }, [slots]);

  async function selectSlot(slot: SlotDTO) {
    setFlowError(null);
    if (phase === "holding" || phase === "confirming") return;
    try {
      const key = crypto.randomUUID();
      const res = await fetch("/api/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ event_type_id: eventTypeId, starts_at: slot.starts_at }),
      });
      const data = await res.json();
      if (res.status === 201) {
        setHold({ id: data.id, hold_expires_at: data.hold_expires_at });
        setSelectedStartsAt(slot.starts_at);
        setPhase("holding");
      } else if (res.status === 409 && data?.code === "capacity_full") {
        setFlowError("That slot just filled. Please pick another.");
        void fetchSlots(viewerTz);
      } else if (res.status === 429) {
        setFlowError("Too many requests. Slow down a little.");
      } else {
        setFlowError(data?.error ?? "Could not reserve this slot.");
      }
    } catch {
      setFlowError("Network error while reserving the slot.");
    }
  }

  async function confirm() {
    if (!hold) return;
    setConfirming(true);
    setFlowError(null);
    try {
      const res = await fetch(`/api/holds/${hold.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guest_name: guestName, guest_email: guestEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setPhase("confirmed");
        setManagementUrl(data.management_url ?? `/bookings/${data.management_token}`);
      } else if (res.status === 410) {
        setPhase("expired");
        setFlowError("Your hold expired before confirmation. Please pick a new slot.");
      } else {
        setFlowError(data?.error ?? "Could not confirm booking.");
      }
    } catch {
      setFlowError("Network error while confirming.");
    } finally {
      setConfirming(false);
    }
  }

  const zoneOptions = useMemo(() => {
    const set = new Set<string>([viewerTz, hostTimezone, ...COMMON_ZONES]);
    return Array.from(set);
  }, [viewerTz, hostTimezone]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section>
          <p className="text-sm text-brand-600">{hostName}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{eventName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {durationMinutes} min · host time {hostTimezone} · capacity {capacity}
          </p>

          <div className="mt-6 flex items-center gap-3">
            <label htmlFor="tz" className="text-sm text-slate-600">
              Your timezone
            </label>
            <select
              id="tz"
              value={viewerTz}
              onChange={(e) => setViewerTz(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
            >
              {zoneOptions.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {loading && (
            <div className="mt-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && !error && grouped.length === 0 && (
            <div className="mt-10 rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
              No available slots in the next two weeks. The host may be booked or away.
            </div>
          )}

          {!loading && !error && grouped.length > 0 && (
            <div className="mt-6 space-y-6">
              {grouped.map(([date, daySlots]) => (
                <div key={date}>
                  <h3 className="text-sm font-medium text-slate-700">
                    {DateTime.fromISO(date, { zone: viewerTz }).toFormat("cccc, MMM d")}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {daySlots.map((s) => {
                      const time = s.starts_at_local.slice(11, 16);
                      const selected = selectedStartsAt === s.starts_at && phase !== "browsing";
                      return (
                        <button
                          key={s.starts_at}
                          data-testid={`slot-${s.starts_at}`}
                          disabled={!s.available}
                          onClick={() => selectSlot(s)}
                          className={`min-w-[88px] rounded-lg border px-3 py-2 text-sm transition ${
                            !s.available
                              ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                              : selected
                                ? "border-brand-500 bg-brand-50 text-brand-700"
                                : "border-slate-200 bg-white hover:border-brand-400 hover:bg-brand-50"
                          }`}
                        >
                          {time}
                          {capacity > 1 && s.available && (
                            <span className="ml-1 text-xs text-slate-400">{s.remaining_capacity} left</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          {phase === "browsing" && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
              Pick a slot to reserve it for 5 minutes. Your hold is secured in the database — no one else
              can take it while it&apos;s active.
            </div>
          )}

          {(phase === "holding" || phase === "confirming" || phase === "expired") && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              {phase === "expired" ? (
                <div className="text-sm text-amber-700">
                  Your hold expired. The server clock is authoritative — please choose a new slot.
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-slate-900">Slot reserved for you</p>
                  <p className="mt-1 text-3xl font-mono tabular-nums text-brand-600">
                    {remaining !== null
                      ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
                      : "--:--"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">remaining to confirm</p>

                  <form
                    className="mt-4 space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void confirm();
                    }}
                  >
                    <div>
                      <label htmlFor="gn" className="text-xs font-medium text-slate-600">
                        Name
                      </label>
                      <input
                        id="gn"
                        required
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="ge" className="text-xs font-medium text-slate-600">
                        Email
                      </label>
                      <input
                        id="ge"
                        type="email"
                        required
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      data-testid="confirm-booking"
                      disabled={confirming || phase !== "holding"}
                      className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {confirming ? "Confirming…" : "Confirm booking"}
                    </button>
                  </form>
                </div>
              )}
              {flowError && <p className="mt-3 text-sm text-red-600">{flowError}</p>}
            </div>
          )}

          {phase === "confirmed" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
              <p className="font-medium">Booking confirmed</p>
              {managementUrl && (
                <a href={managementUrl} className="mt-2 inline-block font-medium underline">
                  Open your booking →
                </a>
              )}
            </div>
          )}

          <ConfidenceTimeline phase={phase} remainingSeconds={remaining} managementUrl={managementUrl} />
        </aside>
      </div>
    </div>
  );
}
