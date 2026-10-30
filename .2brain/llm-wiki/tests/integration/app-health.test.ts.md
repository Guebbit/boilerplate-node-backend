---
source: tests/integration/app-health.test.ts
sha256: d083b6442431639a8d78bf9c672297846e8fbb41dedff6fbc1ceeecdacb78269
generated_at: 2026-10-29T06:52:04.033441+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/app-health.test.ts

## Purpose

Integration tests for the root `/` endpoint and the `/livez` / `/readyz` liveness/readiness probes. They exercise the real application exported from `src/app.ts` through the shared supertest harness, verifying welcome-payload shape, 404 handling, request-id semantics, and the readiness lifecycle across booting → listening → draining phases.

## Key elements

- **`describe('System routes')`** — covers `GET /` (200 + `x-request-id` header + `{ status: "ok" }` body), 404 for unknown paths, server-generated request-id vs. client-supplied id (asserted via a `logger.log` spy on the access-log line), trusted-ingress adoption of the client id, and replacement of a malformed (non-UUID) `x-request-id`.
- **`describe('GET /livez and GET /readyz across the process lifecycle')`** — a single `it` that sequentially asserts: `/readyz` → 503 while booting, `/livez` → 200 while booting; `markServerListening()` → `/readyz` 200; `markServerDraining()` → `/readyz` 503 while `/livez` remains 200.
- **`setupTestDb()`** — called at module top level; provisions a database because session-cookie auth (used by observability routes) requires a user row.
- **`api()`** — the supertest client wrapping the real app; used for every request in the file.

## Relationships

- **`tests/support/http.ts`** — provides `api()`; its harness imports and mounts the real app from `src/app.ts` and skips auto-start under `NODE_ENV=test`, which is why the process begins in the *booting* phase.
- **`src/infrastructure/runtime/readiness.ts`** — the test calls `markServerListening()` and `markServerDraining()` to advance the one-way readiness state machine and observe the corresponding `/readyz` status codes.
- **`src/infrastructure/adapters/logger.ts`** — the request-id test spies on `logger.log` to inspect the access-log structured payload (`requestId`, `clientRequestId` fields).
- **`tests/support/environment.ts`** — `setEnvironment({ NODE_TRUSTED_INGRESS: 'true' })` flips the flag that lets the app adopt a client-supplied request id.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` seeds the test database before any test runs.

## Notes

- The readiness lifecycle test is intentionally a **single** `it` block. Because the readiness phase only moves forward and the suite may run shuffled, splitting it into separate cases would make them order-dependent.
- Redis is deliberately **not** started; none of the routes exercised here require it.
- The malformed `x-request-id` test uses an ordinary non-UUID string rather than CR/LF, because Node's HTTP client already rejects literal CR/LF in header values. The assertion targets the server-side shape check that guards against log-injection for values a client can actually send.
- The app's auto-start is suppressed under `NODE_ENV=test` (see `tests/support/http.ts` docblock), so the process always begins in the *booting* phase; the test must explicitly call `markServerListening()` to reach the *listening* state.
