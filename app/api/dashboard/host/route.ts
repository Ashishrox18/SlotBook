export const runtime = "nodejs";
import type { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getHostBySlug } from "@/lib/availability/queries";
import { HostSettingsSchema } from "@/lib/validation/schemas";
import { getDashboardHostSlug } from "@/lib/security/dashboard";
import { respond } from "@/lib/observability/http";

export async function GET(req: NextRequest) {
  const slug = getDashboardHostSlug(req);
  if (!slug) return respond({ error: "Unauthorized", code: "unauthorized" }, 401, req);
  const host = await getHostBySlug(slug);
  if (!host) return respond({ error: "Host not found", code: "not_found" }, 404, req);
  return respond({ id: host.id, slug: host.slug, name: host.name, timezone: host.timezone }, 200, req);
}

export async function PUT(req: NextRequest) {
  const slug = getDashboardHostSlug(req);
  if (!slug) return respond({ error: "Unauthorized", code: "unauthorized" }, 401, req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = HostSettingsSchema.safeParse(body);
  if (!parsed.success) return respond({ error: "Validation failed", issues: parsed.error.flatten() }, 400, req);

  await sql`UPDATE hosts SET name = ${parsed.data.name}, timezone = ${parsed.data.timezone}, updated_at = now() WHERE slug = ${slug}`;
  return respond({ ok: true }, 200, req);
}
