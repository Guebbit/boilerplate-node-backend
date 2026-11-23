---
source: src/modules/observability/tests/unit/routes.test.ts
source_sha256: 82f1a800ac7bcea8dee302ee09fb655587b456ceae88e7417039f0500a3e983b
context_sha256: 6b3f4b2d06cd2e2113f8c74d2dc7c2286889c8910f8f9d7e5cdc98e11ea969c5
generated_at: 2026-11-22T06:06:15.108145+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/tests/unit/routes.test.ts

## Purpose
Unit tests for the observability route table. They pin down which endpoints are mounted, in what order, and which guard chain protects each one. They also cover the worker process's separate router, which serves only the metrics scrape.

## Key elements
- **`what is mounted` tests**: assert `router` exposes exactly `GET /events`, `/metrics`, `/health`, `/metrics/overview` and `/audit`, in that order. A second test asserts `/metrics` is declared before `/metrics/overview`. The file calls this a stated convention and the place a future `/metrics/:name` would break.
- **`the two guard styles` tests**:
  - `GET /events` must have the chain `requireAllowedOrigin`, `requirePermissionViaCookieGuard`, `getObservabilityEvents`, and must not contain `isAuth`. The reason given is that `EventSource` cannot send a header.
  - `GET /metrics` must have the chain `isMetricsScraper`, `getObservabilityMetrics`. The reason given is that Prometheus cannot log in.
  - `GET /health`, `/metrics/overview` and `/audit` (via `it.each`) must include `getAuth`, `isAuth` and `requirePermissionGuard`.
  - A sweep test fails if any route lacks all of `requirePermissionGuard`, `requirePermissionViaCookieGuard` and `isMetricsScraper`.
- **`worker routes` tests**: `workerRouter` mounts only `GET /metrics`, and its guard chain must equal the API router's `GET /metrics` chain.

## Relationships
- `src/modules/observability/routes.ts`: provides `router`, the API route table under test. The module doc says its comments explain why `/events` and `/metrics` are guarded differently from the other three.
- `src/modules/observability/worker-routes.ts`: provides `workerRouter`, the worker's scrape-only router.
- `tests/support/routes.ts` (imported as `@tests/routes`): provides the helpers `routeSignatures`, `guardsOn` and `routeTable`. The tests use them to read method/path signatures, guard names and path order from a router.

## Notes
- The guards are matched by name, as strings (e.g. `'isAuth'`), so renaming a guard or controller breaks these tests.
- The tests check the route table's structure, not handler behavior.
- Sharing the same guard chain for the API and worker `/metrics` routes is intentional, so the two cannot drift.
