export const runtime = "nodejs";
import type { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getHostBySlug } from "@/lib/availability/queries";
import { OverrideSchema } from "@/lib/validation/schemas";
import { getDashboardHostSlug } from "@/lib/security/dashboard";
import { respond } from "@/lib/observability/http";
import type { OverrideRow } from "@/lib/types";

export async function GET(req: NextRequest) {
  const slug = getDashboardHostSlug(req);
  if (!slug) return respond({ error: "Unauthorized", code: "unauthorized" }, 401, req);
  const host = await getHostBySlug(slug);
  if (!host) return respond({ error: "Host not found", code: "not_found" }, 404, req);
  const rows = await sql<OverrideRow>`SELECT * FROM availability_overrides WHERE host_id = ${host.id} ORDER BY local_date`;
  return respond({ overrides: rows.rows }, 200, req);
}

export async function POST(req: NextRequest) {
  const slug = getDashboardHostSlug(req);
  if (!slug) return respond({ error: "Unauthorized", code: "unauthorized" }, 401, req);
  const host = await getHostBySlug(slug);
  if (!host) return respond({ error: "Host not found", code: "not_found" }, 404, req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return respond({ error: "Invalid body", code: "invalid_body" }, 400, req);
  }
  const parsed = OverrideSchema.safeParse(body);
  if (!parsed.success) return respond({ error: "Validation failed", issues: parsed.error.flatten() }, 400, req);
  const d = parsed.data;

  const rows = await sql<OverrideRow>`
    INSERT INTO availability_overrides (host_id, local_date, override_type, start_local_time, end_local_time)
    VALUES (${host.id}, ${d.local_date}, ${d.override_type}, ${d.start_local_time}, ${d.end_local_time})
    RETURNING *`;
  return respond(rows.rows[0], 201, req);
}
