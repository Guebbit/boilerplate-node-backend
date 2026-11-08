---
source: tests/integration/app-health.test.ts
sha256: d083b6442431639a8d78bf9c672297846e8fbb41dedff6fbc1ceeecdacb78269
generated_at: 2026-11-08T09:35:05.156602+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/app-health.test.ts

## Purpose

Integration tests that exercise the real application (built from `src/app.ts`) through the shared supertest harness. Covers the welcome endpoint (`GET /`), 404 handling, `x-request-id` semantics (own ID vs. client-supplied, trusted-ingress adoption, malformed-value rejection), and the `/livez` + `/readyz` readiness-lifecycle states. Redis is intentionally **not** started; a database is, because session-cookie auth on `/observability/events` requires a user row.

## Key elements

- **`setupTestDb()`** – called at module top level (not in `beforeAll`) so the session/DB is available before any test in the file runs.
- **`describe('System routes')`** – five cases:
  - `GET /` returns 200, an `x-request-id` header, and `{ status: 'ok' }`.
  - Unknown path returns 404.
  - Client-supplied `x-request-id` is **not** adopted; the service's own ID is returned and the client value is logged as `clientRequestId` (verified by spying on `logger.log`).
  - With `NODE_TRUSTED_INGRESS=true` the client ID **is** adopted.
  - A malformed (non-UUID) client ID is replaced with a fresh UUID, never reflected back.
- **`describe('GET /livez and GET /readyz across the process lifecycle')`** – single `it` block that walks the phase forward (`booting → listening → draining`) using `markServerListening()` / `markServerDraining()`, asserting `/readyz` returns 503/200/503 while `/livez` stays 200 with an empty body throughout.

## Relationships

- **`tests/support/http.ts`** – provides the `api()` supertest helper. Its docblock notes that `src/app.ts` auto-start is skipped when `NODE_ENV=test`, so the process begins in the `'booting'` phase.
- **`tests/support/setup-test-db.ts`** – provides `setupTestDb`; required because admin-session authentication for `/observability/events` needs a user record.
- **`tests/support/environment.ts`** – provides `setEnvironment`, used to set `NODE_TRUSTED_INGRESS` for the trusted-ingress test.
- **`src/infrastructure/runtime/readiness.ts`** – exports `markServerListening` / `markServerDraining`, the only way to advance the readiness phase forward during the lifecycle test.
- **`src/infrastructure/adapters/logger.ts`** – its `logger.log` is spied on in the request-id test to inspect the structured access-log payload (`requestId`, `clientRequestId`).

## Notes

- The readiness lifecycle is a **single test** (not three) because the phase only moves forward and Jest may run tests shuffled; splitting into separate `it` blocks would make the suite order-dependent.
- The malformed-ID test sends a plain non-UUID string (`'not-a-uuid'`) rather than CRLF characters because Node's `http` client already rejects raw CR/LF in header values before the app sees them.
- The test file deliberately drives the **real** `src/app.ts` middleware stack; assembling a private Express app would risk validating a stack the production app doesn't have.
- `setupTestDb()` is a top-level call, not wrapped in `beforeAll`—a convention that ensures the DB is ready before *any* test (including suite-level hooks) executes.
