---
source: tests/integration/app-health.test.ts
sha256: b35506a9e3a6dec95ef1fac22affad4e0bdd05090d33a1a706fa9cbc3ce3f901
generated_at: 2026-09-27T15:54:22.773199+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/app-health.test.ts

## Purpose

Integration tests for the system routes (`/`, `/readyz`, 404 handling, `x-request-id` validation) and the observability routes (`/observability/metrics`, `/observability/events`, and auth-guarded sub-paths). They exercise the real application assembled in `src/app.ts` through the shared supertest harness, verifying readiness-state transitions, request-id sanitization, Prometheus metrics exposure, SSE event streaming, and that auth middleware is actually mounted on protected paths.

## Key elements

- **`describe('System routes')`** — Asserts `GET /` returns 200 with `x-request-id` header and `data.status === 'ok'`; unknown paths return 404; a well-formed UUID in `x-request-id` is echoed back; a non-UUID value is replaced with a generated UUID (log-injection guard).
- **`describe('GET /readyz')`** — Drives the readiness phase directly via `markServerListening` / `markServerDraining` and asserts 503 (booting) → 200 (listening) → 503 (draining).
- **`describe('Observability routes')`** — Verifies `/observability/metrics` returns Prometheus text (auth via `NODE_METRICS_TOKEN` bearer); `/observability/events` streams SSE with an admin session cookie; three protected sub-paths return **401** (proving auth middleware exists, not just a missing route).
- **Custom SSE parser** — A `parse` callback attached to the supertest request reads the stream, aborts on the first `data: ` chunk, and resolves the buffered body so supertest does not wait for an EOF that never comes.

## Relationships

- **`tests/support/http.ts`** — Provides the `api()` supertest client bound to the real app. Under `NODE_ENV=test` the app's auto-start (which would call `markServerListening`) is suppressed here, so readiness tests must drive the phase manually.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is invoked at module top-level to provision the test database; required because the SSE events test authenticates with an admin session cookie.
- **`src/modules/users/tests/factories.ts`** — `createAdminUser` creates a test admin; `PLAIN_PASSWORD` is the shared test password used for the login call that yields the session cookie.
- **`src/infrastructure/runtime/readiness.ts`** — Exports `markServerListening` and `markServerDraining`, which the readyz tests call directly to transition the process through its lifecycle phases.

## Notes

- **Test order matters for readyz.** The "still booting" case must remain first in its `describe` block: it asserts the default (un-listened) state, and would silently pass if a later test had already called `markServerListening`.
- **Redis is intentionally absent.** None of the routes under test require Redis, so no Redis server is started.
- **SSE stream is never fully consumed.** The custom parser destroys the socket after the first `data: ` event; do not remove this or supertest will hang waiting for a stream that never ends.
- **401 vs 404 distinction on observability sub-paths.** The `it.each` block asserts 401 specifically — a 404 would mean the auth middleware was never mounted on the path, which would mask a real misconfiguration.
