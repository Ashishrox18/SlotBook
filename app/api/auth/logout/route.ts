export const runtime = "nodejs";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/security/auth";
import { respond } from "@/lib/observability/http";

export async function POST(req: NextRequest) {
  const res = respond({ ok: true }, 200, req);
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
