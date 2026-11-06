export const runtime = "nodejs";
import { type NextRequest } from "next/server";
import { DateTime } from "luxon";
import { dbNow } from "@/lib/db";
import {
  getActiveCounts,
  getEventTypeByHostSlug,
  getOverrides,
  getWeeklyAvailability,
} from "@/lib/availability/queries";
import { generateSlots } from "@/lib/availability/slots";
import { SlotsQuerySchema } from "@/lib/validation/schemas";
import { respond, clientIp, logReq } from "@/lib/observability/http";
import { rateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidZone } from "@/lib/time";

export async function GET(req: NextRequest, { params }: { params: { host: string; slug: string } }) {
  const start = Date.now();
  const ip = clientIp(req);
  if (!rateLimit(`slots:${ip}`, RATE_LIMITS.slotsRead)) {
    return respond({ error: "Too many requests", code: "rate_limited" }, 429, req);
  }

  const found = await getEventTypeByHostSlug(params.host, params.slug);
  if (!found) {
    logReq("slots", req, 404, start);
    return respond({ error: "Event not found", code: "not_found" }, 404, req);
  }
  const { host: hostRow, eventType } = found;

  const query = SlotsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) {
    logReq("slots", req, 400, start);
    return respond({ error: "Invalid query", issues: query.error.flatten() }, 400, req);
  }

  // Viewer timezone: requested tz if valid, else the browser's zone, else host tz.
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const viewerTz =
    query.data.tz && isValidZone(query.data.tz)
      ? query.data.tz
      : browserTz && isValidZone(browserTz)
        ? browserTz
        : hostRow.timezone;

  const now = DateTime.fromJSDate(await dbNow(), { zone: "UTC" });
  const todayHost = now.setZone(hostRow.timezone).startOf("day");
  const from = query.data.from ?? todayHost.toISODate()!;
  const to = query.data.to ?? todayHost.plus({ days: eventType.booking_horizon_days }).toISODate()!;

  const weekly = await getWeeklyAvailability(hostRow.id);
  const overrides = await getOverrides(hostRow.id);

  const rangeFromUtc = DateTime.fromISO(from, { zone: hostRow.timezone }).startOf("day").toUTC().toISO()!;
  const rangeToUtc = DateTime.fromISO(to, { zone: hostRow.timezone }).endOf("day").toUTC().toISO()!;
  const active = await getActiveCounts(eventType.id, rangeFromUtc, rangeToUtc);

  const slots = generateSlots({
    host: hostRow,
    eventType,
    weekly,
    overrides,
    fromIso: from,
    toIso: to,
    now,
    viewerTz,
    activeBookings: active,
  });

  logReq("slots", req, 200, start);
  return respond(
    {
      host: { name: hostRow.name, slug: hostRow.slug, timezone: hostRow.timezone },
      event_type: {
        name: eventType.name,
        slug: eventType.slug,
        duration_minutes: eventType.duration_minutes,
        capacity: eventType.capacity,
        buffer_before_minutes: eventType.buffer_before_minutes,
        buffer_after_minutes: eventType.buffer_after_minutes,
        minimum_notice_minutes: eventType.minimum_notice_minutes,
        booking_horizon_days: eventType.booking_horizon_days,
      },
      viewer_timezone: viewerTz,
      from,
      to,
      slots,
    },
    200,
    req,
  );
}

// Keep this route fully dynamic; it always reads live DB state.
export const dynamic = "force-dynamic";
