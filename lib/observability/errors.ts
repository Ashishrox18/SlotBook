/**
 * Standardised API error envelope:
 * { "error": { "code": "SLOT_FULL", "message": "...", "requestId": "..." } }
 *
 * All public API routes return this shape on errors, so integrators can rely
 * on a single discriminant (`error.code`) for error handling.
 */
export function apiError(
  code: string,
  message: string,
  requestId?: string,
  extra?: Record<string, unknown>,
) {
  return {
    error: {
      code,
      message,
      ...(requestId ? { requestId } : {}),
      ...extra,
    },
  };
}

/** Map internal booking engine result bodies to the standard error envelope. */
export function normaliseError(body: unknown, requestId?: string): unknown {
  if (typeof body !== "object" || body === null) return body;
  const b = body as Record<string, unknown>;
  // Already in new envelope shape — return as-is.
  if (b["error"] && typeof b["error"] === "object") return body;
  // Legacy flat shape { error: string, code: string } → wrap it.
  if (typeof b["error"] === "string") {
    return apiError(
      (b["code"] as string) ?? "UNKNOWN",
      b["error"] as string,
      requestId,
    );
  }
  return body;
}
