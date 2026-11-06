import { NextResponse, type NextRequest } from "next/server";

/**
 * Propagates an X-Request-ID across the request lifecycle. If the client
 * supplies one we honor it; otherwise we generate one. The id is added to the
 * forwarded request headers (so route handlers can read/log it) and to the
 * response headers (so clients can correlate). Uses the Web Crypto API, which
 * is available in the Edge runtime where Next.js runs middleware.
 */
export function middleware(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("x-request-id", requestId);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
