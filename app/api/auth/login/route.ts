import type { NextRequest } from "next/server";
import { isDemoPassword, createSessionToken, SESSION_COOKIE } from "@/lib/security/auth";
import { respond } from "@/lib/observability/http";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  if (!isDemoPassword(password)) {
    return respond({ error: "Invalid password", code: "invalid_password" }, 401, req);
  }
  const hostSlug = typeof body?.host === "string" && body.host.length > 0 ? body.host : "alex-morgan";
  const token = createSessionToken(hostSlug);
  const res = respond({ host_slug: hostSlug }, 200, req);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
