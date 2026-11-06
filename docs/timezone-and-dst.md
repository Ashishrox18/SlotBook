# Timezone and DST Strategy

## Principle

Host availability is specified in **wall-clock time** in the host's IANA timezone. A host who says "I am available 09:00–17:00 Monday" means that in their timezone, regardless of whether DST is in effect on that particular Monday.

We use [Luxon](https://moment.github.io/luxon/) for all timezone-aware date arithmetic. Luxon carries the full IANA timezone database and resolves wall-clock times to UTC instants correctly — including across DST transitions.

**We never compute UTC offsets by hand.**

## The DST-Critical Operation

Converting "09:00 on a specific local date in a specific zone" to a UTC instant:

```typescript
// lib/time/index.ts
export function localToUtc(hostTz: string, dateIso: string, localTime: string): DateTime {
  return DateTime.fromISO(`${dateIso}T${localTime}`, { zone: hostTz }).toUTC();
}
```

Luxon resolves the correct offset for that specific date, not a fixed annual offset.

## DST Example: America/New_York

US Eastern time switches from **EST (UTC-5)** to **EDT (UTC-4)** on the second Sunday of March (2024: 10 March at 02:00).

| Date | Local Time | UTC | Offset |
|------|-----------|-----|--------|
| Fri 2024-03-08 | 09:00 EST | 14:00 UTC | -5 |
| Mon 2024-03-11 | 09:00 EDT | 13:00 UTC | -4 |

The same wall-clock time "09:00" maps to **different UTC instants** depending on which side of the transition the date falls on.

### How a Guest in Asia/Kolkata Sees This

| Date | NY slot (UTC) | Kolkata (UTC+5:30) |
|------|--------------|-------------------|
| Fri 2024-03-08 | 14:00 UTC | 19:30 IST |
| Mon 2024-03-11 | 13:00 UTC | 18:30 IST |

The guest's calendar shows 19:30 before the transition and 18:30 after — because the host moved their clock.

### Test Coverage

`tests/unit/time-dst.test.ts`:

```
✓ converts host-local wall clock to UTC before DST (EST = UTC-5)
✓ converts host-local wall clock to UTC after DST (EDT = UTC-4)
✓ the same host wall-clock slot maps to different UTC instants across DST
✓ shows a NY 09:00 EDT slot correctly in Asia/Kolkata
```

## All Persisted Instants Are `timestamptz`

Every `starts_at`, `ends_at`, `hold_expires_at`, `created_at`, `updated_at` column is `TIMESTAMPTZ`. PostgreSQL stores them as UTC and renders them in the session timezone. We always pass UTC instants and always read UTC instants.

## The Viewer Timezone

The slots API accepts a `tz` query parameter (IANA). Slots are:
- **Generated** from the host timezone (determines which dates have availability).
- **Stored/compared** as UTC (authoritative).
- **Displayed** in the viewer's requested timezone (UI only).

The viewer timezone never affects correctness — it only affects how `starts_at_local` is formatted in the response.
