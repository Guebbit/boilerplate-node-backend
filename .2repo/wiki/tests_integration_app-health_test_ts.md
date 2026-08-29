# tests/integration/app-health.test.ts

## Purpose
Integration tests that exercise the **real** application (from `src/app.ts`) via the shared supertest harness. They cover the root welcome endpoint, 404 handling, and the `/observability/*` routes (metrics, events/SSE, and auth-gated paths). The file exists to catch regressions in middleware ordering, auth wiring, and response contracts without spinning up Redis.

## Key elements
- **`setupTestDb()`** — called once at module scope to initialise the test database (required because the SSE route authenticates via an admin session cookie).
- **`describe('System routes')`** — asserts `GET /` returns 200 with `x-request-id` and `data.status === 'ok'`; asserts unknown paths return 404.
- **`describe('Observability routes')`** — three sub-groups:
  - *Metrics*: `GET /observability/metrics` with a static bearer token (`NODE_METRICS_TOKEN`); verifies Prometheus exposition format and expected metric names.
  - *Events (SSE)*: `GET /observability/events` authenticated with an admin session cookie; uses a custom supertest parser that reads the stream until the first `data:` chunk then destroys it (the stream is infinite).
  - *Auth guards*: parameterised 401 check on `/observability/health`, `/observability/metrics/overview`, `/observability/audit` — proving the auth middleware is mounted, not just that the path is absent.

## Relationships
- **`tests/support/http.ts`** — provides `api()`, the shared supertest instance pointed at the real app. Every request in this file goes through it.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, which configures the in-memory/test database connection before any test runs.
- **`src/modules/users/tests/factory.ts`** — provides `createAdminUser()` (creates a fixture user) and `PLAIN_PASSWORD` (the constant password for that fixture), used to log in and obtain the session cookie for the SSE test.

## Notes
- The SSE test must use a **session cookie**, not a bearer token, because the browser `EventSource` API cannot set custom headers — the test mirrors the real frontend path (`withCredentials: true`).
- The SSE custom parser destroys the `IncomingMessage` stream after the first `data:` chunk; without this, supertest would hang waiting for an `end` event that never arrives.
- The 401 assertions are deliberately chosen over 404/500 to confirm the **auth middleware is in the chain** for those paths.
- Redis is intentionally **not** started; none of the exercised routes depend on it.
- The file drives the production app (`src/app.ts`), not a locally-constructed Express instance, to avoid false confidence from a mismatched middleware stack.
