# tests/integration/app-health.test.ts

## Purpose

Integration tests for the system route (`/`) and the observability routes (`/observability/*`). They drive the **real** application exported from `src/app.ts` through the shared supertest harness to verify middleware ordering, response shapes, and auth behavior as deployed — not against a privately-assembled Express app.

## Key elements

- **`setupTestDb()`** — called once at module level to provision a test database (needed because `/observability/events` requires a session-bound admin user).
- **`describe('System routes')`** — asserts `GET /` returns 200 with `x-request-id` and a `status: "ok"` body; asserts 404 for unknown paths; asserts a well-formed UUID in `x-request-id` is echoed back verbatim; asserts a malformed (non-UUID) `x-request-id` is **replaced** by a valid UUID rather than reflected.
- **`describe('Observability routes')`** —
  - `GET /observability/metrics`: authenticates with a static `Bearer` token (`NODE_METRICS_TOKEN`), expects Prometheus exposition text.
  - `GET /observability/events`: creates an admin user, logs in to obtain a `jwt` session cookie, then reads the SSE stream using a **custom supertest parser** that accumulates data and destroys the stream as soon as the first `data: ` chunk arrives (the endpoint streams indefinitely).
  - `it.each` over `/observability/health`, `/observability/metrics/overview`, `/observability/audit`: each must return **401** (not 404/500) without credentials, proving the auth middleware is actually mounted on the path.

## Relationships

- **`tests/support/http.ts`** — supplies the `api()` helper; the supertest instance wrapping the real app from `src/app.ts`. Every request in this file goes through it.
- **`tests/support/setup-test-db.ts`** — supplies `setupTestDb()`, called at the top of the module to seed/point at a throwaway database for the session-based SSE test.
- **`src/modules/users/tests/fixtures.ts`** — supplies `createAdminUser` and `PLAIN_PASSWORD`, used to create an admin account and log in so the SSE events test can present a valid session cookie.

## Notes

- **Redis is intentionally not started.** The routes under test do not require it; spinning it up would add flakiness for no coverage gain.
- **SSE parsing workaround.** Supertest buffers the entire response by default. The custom `parse` callback collects chunks and calls `stream.destroy()` the moment `data: ` appears, letting supertest settle the promise. Without this the test hangs forever.
- **`x-request-id` malformed-value test** uses a plain non-UUID string (`'not-a-uuid'`) rather than a CR/LF injection payload, because Node's HTTP client itself rejects literal CRLF in header values before the server ever sees them.
- **401-not-404 assertion** is deliberate: a 404 could mean the route was never registered; a 401 proves the auth middleware sits in front of a real handler.
- The metrics token comes from `process.env.NODE_METRICS_TOKEN`; if unset the header is an empty string and the test will fail with a non-200, surfacing a missing env var.
