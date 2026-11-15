---
source: src/modules/observability/tests/unit/routes.test.ts
sha256: 874a24288744916f3177c85ba0148fbe562d70623a98f0fd49f0f54db0d5e569
generated_at: 2026-11-14T20:31:08.225367+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/routes.test.ts

## Purpose

Unit tests that verify the observability route table: exactly which endpoints are mounted, their declared order, and which guard chain protects each one. It pins the structural contract of `routes.ts` so that adding, reordering, or mis-guarding a route is caught immediately.

## Key elements

- **`describe('observability routes — what is mounted')`** — asserts the five endpoints (`/events`, `/metrics`, `/health`, `/metrics/overview`, `/audit`) appear in the documented order, and that `/metrics` precedes `/metrics/overview` (the one pair where a future `:param` route would collide).
- **`describe('observability routes — the two guard styles')`** — verifies three distinct guard chains:
  - `GET /events`: cookie-based (`requireAllowedOrigin` → `requirePermissionViaCookieGuard` → handler); explicitly asserts `isAuth` is *absent* because `EventSource` cannot send headers.
  - `GET /metrics`: static credential (`isMetricsScraper` → handler); no session-based auth.
  - `GET /health`, `GET /metrics/overview`, `GET /audit`: identity + permission chain (`getAuth` → `isAuth` → `requirePermissionGuard` → handler), tested via `it.each`.
- **"Leaves no observability endpoint unguarded"** — a sweep test that fails if any route lacks one of the three recognized permission guards.

## Relationships

- **`src/modules/observability/routes.ts`** — imports `router`; it is the system under test. The file validates its mount order and guard composition without invoking any handler.
- **`tests/support/routes.ts`** — imports the `routeSignatures`, `guardsOn`, and `routeTable` helpers used to introspect the router without making HTTP requests.

## Notes

- The JSDoc header points to `get-observability-events.test.ts` and `get-observability-metrics.test.ts` for handler *behavior*; this file tests only *structure* (mounts + guards), not responses.
- The `/metrics` → `/metrics/overview` ordering check is load-bearing: it is the single spot where inserting a `/metrics/:name` route would silently shadow `/metrics/overview`. If that param route is ever added, this test must be updated.
- The "unguarded" sweep enumerates all three accepted guard names; adding a fourth guard style requires updating that list here, or the new style will be treated as unguarded.
