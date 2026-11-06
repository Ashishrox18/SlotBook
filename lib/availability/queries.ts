import { sql } from "../db";
import type { EventType, Host, OverrideRow, WeeklyWindow } from "../types";

export async function getHostBySlug(slug: string): Promise<Host | null> {
  const res = await sql<Host>`SELECT * FROM hosts WHERE slug = ${slug}`;
  return res.rows[0] ?? null;
}

export async function getEventTypeByHostSlug(
  hostSlug: string,
  eventSlug: string,
): Promise<{ host: Host; eventType: EventType } | null> {
  const host = await getHostBySlug(hostSlug);
  if (!host) return null;
  const res = await sql<EventType>`SELECT * FROM event_types WHERE host_id = ${host.id} AND slug = ${eventSlug}`;
  const eventType = res.rows[0];
  if (!eventType) return null;
  return { host, eventType };
}

export async function getEventTypeById(id: string): Promise<EventType | null> {
  const res = await sql<EventType>`SELECT * FROM event_types WHERE id = ${id}`;
  return res.rows[0] ?? null;
}

export async function getEventHost(eventType: EventType): Promise<Host | null> {
  const res = await sql<Host>`SELECT * FROM hosts WHERE id = ${eventType.host_id}`;
  return res.rows[0] ?? null;
}

export async function getWeeklyAvailability(hostId: string): Promise<WeeklyWindow[]> {
  const res =
    await sql<WeeklyWindow>`SELECT * FROM weekly_availability WHERE host_id = ${hostId} ORDER BY weekday, start_local_time`;
  return res.rows;
}

export async function getOverrides(hostId: string): Promise<OverrideRow[]> {
  const res =
    await sql<OverrideRow>`SELECT * FROM availability_overrides WHERE host_id = ${hostId} ORDER BY local_date`;
  return res.rows;
}

/**
 * Count of currently-active bookings per slot start for an event, over a UTC
 * instant range. "Active" = confirmed, or held with an unexpired hold. Expired
 * holds that have not yet been lazily marked are excluded here so the public
 * calendar never hides capacity that has actually freed up.
 */
export async function getActiveCounts(
  eventTypeId: string,
  fromIso: string,
  toIso: string,
): Promise<Map<string, number>> {
  const res = await sql<{ starts_at: Date; count: string }>`
    SELECT starts_at, count(*)::text AS count
    FROM bookings
    WHERE event_type_id = ${eventTypeId}
      AND starts_at >= ${fromIso}
      AND starts_at <= ${toIso}
      AND status IN ('held', 'confirmed')
      AND (status = 'confirmed' OR hold_expires_at > now())
    GROUP BY starts_at`;
  const map = new Map<string, number>();
  for (const r of res.rows) {
    map.set(new Date(r.starts_at).toISOString(), Number(r.count));
  }
  return map;
}
