"use client";

interface Props {
  phase: "browsing" | "holding" | "confirming" | "confirmed" | "expired";
  remainingSeconds: number | null;
  managementUrl: string | null;
}

function Step({ done, label, detail }: { done: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span
        className={`mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs ${
          done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
        }`}
        aria-hidden
      >
        {done ? "✓" : "•"}
      </span>
      <div>
        <p className={`text-sm ${done ? "text-slate-900" : "text-slate-500"}`}>{label}</p>
        {detail && <p className="text-xs text-slate-500">{detail}</p>}
      </div>
    </div>
  );
}

/** A transparent lifecycle visualization that communicates the reliability guarantees. */
export default function ConfidenceTimeline({ phase, remainingSeconds, managementUrl }: Props) {
  const held = phase === "holding" || phase === "confirming" || phase === "confirmed";
  const expired = phase === "expired";
  const confirmed = phase === "confirmed";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-medium text-slate-700">Booking confidence timeline</h3>
      <div className="mt-3 divide-y divide-slate-100">
        <Step done={held} label="Slot selected" />
        <Step
          done={held}
          label="Capacity secured"
          detail="Held atomically in a PostgreSQL transaction — no double-booking is possible."
        />
        <Step
          done={held}
          label="Your hold is active"
          detail={
            expired
              ? "Hold expired — server time is authoritative. Pick a new slot."
              : held && remainingSeconds !== null
                ? `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")} remaining`
                : "Waiting for slot selection"
          }
        />
        <Step done={confirmed} label="Confirm your booking" />
        {confirmed && (
          <div className="pt-3">
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              <p>✓ Booking stored safely</p>
              <p className="mt-1">✓ Notification event recorded (transactional outbox)</p>
              <p className="mt-1">✓ Private management link created</p>
              {managementUrl && (
                <a href={managementUrl} className="mt-2 inline-block font-medium underline">
                  Open your booking →
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
