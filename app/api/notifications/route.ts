import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

interface NotifRow {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: Date;
}

/** Public demo sink for the notification outbox. Guest PII is redacted on read. */
export async function GET() {
  const rows = await sql<NotifRow>`
    SELECT id, event_type, payload, status, created_at
    FROM notification_events ORDER BY created_at DESC LIMIT 100`;

  const events = rows.rows.map((r) => {
    const { guest_email, ...rest } = r.payload as Record<string, unknown>;
    return {
      id: r.id,
      event_type: r.event_type,
      payload: { ...rest, guest_email: guest_email ? "[redacted]" : undefined },
      status: r.status,
      created_at: new Date(r.created_at).toISOString(),
    };
  });

  return NextResponse.json({ events });
}
