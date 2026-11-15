---
source: src/modules/notifications/tests/integration/stream-cap.test.ts
sha256: efaf8c668c9ef1b133950f18a751b59f1bedc3841e7a05221bb2d37cfb89897b
generated_at: 2026-11-14T20:26:46.298274+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/integration/stream-cap.test.ts

## Purpose

Integration test for the per-account and process-wide SSE stream caps on `GET /notifications/stream`. Verifies via a real HTTP socket that an account exceeding its share is refused (429 + `Retry-After`), that closing a stream frees the slot, that one account's streams don't count against another, and that the process ceiling yields a 503.

## Key elements

- **`held: IncomingMessage[]`** – module-level array of open stream connections; destroyed in `afterEach` so `openStreamCount` returns to zero.
- **`listening`** – the test server (from `@tests/http`) started in `beforeAll`, closed in `afterAll`.
- **`sessionCookie(username)`** – creates a user via the factory, logs in through the API, and extracts the `__Host-session` cookie value.
- **`Opened`** – interface carrying `status` and `headers` of a stream-open attempt (body is not read).
- **`openStream(cookie)`** – issues a raw `http.get` to `/notifications/stream`, pushes the live response into `held`, resolves as soon as headers arrive.
- **`describe('GET /notifications/stream, held streams')`** – three tests:
  - Per-account cap (429, slot freed after destroy).
  - Account isolation (one account's cap doesn't block another).
  - Process ceiling (503 with `Retry-After`).

## Relationships

- **`src/modules/notifications/services/stream.ts`** – imports `openStreamCount()` to assert the live stream gauge after open/destroy cycles.
- **`src/modules/users/tests/factories.ts`** – imports `createUser` and `PLAIN_PASSWORD` to provision authenticated test accounts.
- **`tests/support/cookies.ts`** – imports `setCookie` to pull the session cookie from the login response header.
- **`tests/support/environment.ts`** – imports `setEnvironment` to set `NODE_SSE_MAX_STREAMS_PER_USER` or `NODE_SSE_MAX_STREAMS` per test.
- **`tests/support/eventually.ts`** – imports `eventually` for async-polling assertions (waiting for the count to drop after destroy).
- **`tests/support/http.ts`** – imports `listen` (real server) and `api` (login request).
- **`tests/support/setup-test-db.ts`** – calls `setupTestDb()` at module load to seed the test database.

## Notes

- Stream requests use raw `node:http` rather than the `api` helper because the response must remain open for the test's lifetime; the `api` helper would consume the body.
- Authentication is via the `__Host-session` cookie because a browser `EventSource` cannot set custom `Authorization` headers.
- `afterEach` destroys every held connection *and* polls `openStreamCount() === 0` before proceeding, preventing cross-test bleed.
- The per-account cap and process ceiling are controlled by separate env vars (`NODE_SSE_MAX_STREAMS_PER_USER` vs `NODE_SSE_MAX_STREAMS`); each test sets only the one under test.
