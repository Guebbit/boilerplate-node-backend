# tests/integration/app-health.test.ts

## Purpose

Integration tests for the root `/` route and the `/observability/*` family (metrics, events, health, audit). They exercise the real application exported from `src/app.ts` through the shared supertest harness, ensuring the actual middleware stack is under test. A database is required (session-cookie auth for the SSE endpoint); Redis is intentionally not started.

## Key elements

- **`setupTestDb()`** — called at module level to provision the test database before any test runs.
- **`describe('System routes')`** — asserts `GET /` returns 200 with a welcome payload and `x-request-id` header; asserts unknown paths return 404.
- **`describe('Observability routes')`** — three test groups:
  - Metrics: `GET /observability/metrics` with a static `Bearer` token (`NODE_METRICS_TOKEN`); verifies Prometheus text exposition format and two expected metric names.
  - Events (SSE): logs in an admin user to obtain a `jwt` session cookie, then requests `GET /observability/events`. Uses a custom supertest `.parse()` that accumulates chunks and **destroys the stream** as soon as the first `data: ` frame arrives (the endpoint streams indefinitely).
  - Auth guard: `it.each` over `/observability/health`, `/observability/metrics/overview`, `/observability/audit` asserts a 401 (not 404/500) is returned without credentials, proving the auth middleware is mounted.

## Relationships

- **`tests/support/http.ts`** — supplies the `api()` factory that wraps supertest against the real app; every request in this file goes through it.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()` to create/reset the test database schema.
- **`src/modules/users/tests/fixtures.ts`** — provides `createAdminUser()` and `PLAIN_PASSWORD`, used to obtain a valid admin session for the SSE authentication test.

## Notes

- The SSE test does **not** hold the connection open; it reads one chunk and destroys the stream. A naive `await api().get(...)` would hang forever.
- The events endpoint authenticates via **session cookie**, not a bearer token, because the browser `EventSource` API cannot set headers. The test mirrors this by extracting the `jwt=…` cookie from a login response.
- The 401 assertions are deliberate: they verify that the auth middleware is present on the route, not merely that the route exists. A missing middleware would surface as 404 or 500 instead.
- Redis is **not** started for this file; none of the exercised routes require it.
