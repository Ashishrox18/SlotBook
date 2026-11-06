# AI Usage Log

AI was used extensively for implementation assistance throughout this project.

## How AI Was Used

- Scaffolded the overall project structure and file layout.
- Generated boilerplate for Next.js App Router routes, Tailwind components, and React client components.
- Proposed initial versions of the SQL schema, migration runner, and seed script.
- Drafted Zod validation schemas and helped identify missing constraints.
- Suggested the advisory lock approach for concurrency control; the rationale was independently reviewed.
- Generated initial test file structure and assertions; tests were manually reviewed for correctness.

## Human Review and Corrections

- The advisory lock strategy was independently verified against the PostgreSQL documentation for `pg_advisory_xact_lock` semantics (transaction-scoped, hash-based).
- The DST conversion logic (Luxon `DateTime.fromISO` with a zone) was manually validated against known UTC offsets for `America/New_York` before and after the 2024 DST transition.
- Several AI-generated test assertions had sign errors (e.g., `before - after` vs `after - before`) and incorrect assumptions (slot count off by one due to missing weekly window fixture) — these were caught and corrected.
- The idempotency conflict detection (same key, different request hash) was manually traced to confirm the path reaches the 409 branch.
- The reschedule atomicity strategy was independently designed to avoid the cancel-before-guarantee failure mode; AI helped implement the verified design.

## Assessment

AI dramatically accelerated boilerplate production. The concurrency-critical and DST-critical code paths required careful human review — AI suggestions were a starting point, not a final answer.
