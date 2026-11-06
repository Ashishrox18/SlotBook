# Security

## Input Validation

Every public API route validates its request body with a Zod schema before touching the database. Schema modules live in `lib/validation/schemas.ts`. An invalid payload returns 400 with a structured error; it never reaches the booking engine.

## Management Tokens

Booking management tokens are `randomBytes(32).toString('hex')` — 256 bits of cryptographically secure entropy. They are:
- Never derived from sequential IDs or guest data.
- Stored in the `management_token` column with a `UNIQUE` index.
- Only returned once (on confirm response); subsequent reads of the booking page require knowing the token.
- Never logged or included in notification payloads.

## Session Tokens (Host Dashboard)

The demo host session cookie contains `{slug}.{HMAC-SHA256(slug, APP_SECRET)}`. It is:
- `httpOnly` and `sameSite: lax`.
- Verified on every dashboard API call using `timingSafeEqual` to prevent timing attacks.
- Not used for any booking correctness decision.

## Rate Limiting

An in-memory fixed-window limiter (`lib/security/rate-limit.ts`) caps requests per IP per minute:

| Endpoint | Limit |
|----------|-------|
| Hold creation | 30/min |
| Confirm | 30/min |
| Reschedule | 30/min |
| Cancel | 30/min |
| Slots (read) | 120/min |

**This is abuse protection, not a correctness mechanism.** Booking correctness is enforced by Postgres. The limiter does not survive application restarts and is per-process. In production, replace with a Redis-backed or edge-level limiter.

## Per-IP Hold Abuse Protection

In addition to the rate limiter, `createHold` checks the number of unexpired active holds from the requesting IP for the same event type. If it exceeds `MAX_ACTIVE_HOLDS_PER_IP_EVENT = 5`, the request is rejected with 429. This prevents one client from holding every slot of an event. Correctness (capacity) is still enforced by the advisory lock regardless of this check.

## Secrets in Environment Variables

- `DATABASE_URL` — never logged, never exposed to the client.
- `APP_SECRET` — used only server-side for HMAC signing.
- `DEMO_HOST_PASSWORD` — never sent to the client.

The `.env.example` file contains only placeholder values. `.env` and `.env.local` are gitignored.

## Known Gaps (by design for this demo)

- No CSRF protection on API routes (would add with a double-submit cookie or SameSite=Strict in production).
- Rate limiter is in-memory only.
- No TLS termination (assumed handled by a load balancer/proxy in production).
