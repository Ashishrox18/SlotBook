import type { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { getHostBySlug } from "@/lib/availability/queries";
import { getDashboardHostSlug } from "@/lib/security/dashboard";
import { respond } from "@/lib/observability/http";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const slug = getDashboardHostSlug(req);
  if (!slug) return respond({ error: "Unauthorized", code: "unauthorized" }, 401, req);
  const host = await getHostBySlug(slug);
  if (!host) return respond({ error: "Host not found", code: "not_found" }, 404, req);
  await sql`DELETE FROM availability_overrides WHERE id = ${params.id} AND host_id = ${host.id}`;
  return respond({ ok: true }, 200, req);
}
