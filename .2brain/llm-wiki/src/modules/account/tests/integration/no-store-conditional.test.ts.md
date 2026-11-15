---
source: src/modules/account/tests/integration/no-store-conditional.test.ts
sha256: 3144d3a509f684f2357653a3969590e2fe9ca685bc83862bf037db1c360d42fc
generated_at: 2026-11-14T19:05:24.156429+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/no-store-conditional.test.ts

## Purpose

Integration test verifying that the origin still honours `If-None-Match` and returns a 304 on a `no-store` endpoint, per RFC 9110 §13.1.2. `no-store` constrains *caches*, not the origin server, so the account router must answer conditionals even when its `Cache-Control` header is `no-store`.

## Key elements

- **`setupTestDb()`** — call made once at module scope to provision a clean test database before the suite runs.
- **`describe('GET /account/sessions with its own tag', …)`** — single test case that:
  - Authenticates a user via `authenticateAs('user')`.
  - Fires a **warm-up** `GET /account/sessions` to flush the throttled `lastUsedAt` write so the body stabilises.
  - Captures the `ETag` from a second (first "real") response.
  - Re-issues the same `GET` with `If-None-Match` set to that ETag.
  - Asserts: status 304, empty body, ETag preserved, and `cache-control: no-store` still present on the 304.

## Relationships

- **`tests/support/http.ts`** — supplies the `api()` request helper (wraps a supertest/fetch client) and `authenticateAs()` which returns a bearer token for a seeded user.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises and seeds the in-memory/test database so the sessions table exists for the endpoint under test.

## Notes

- The warm-up request is intentional: the sessions endpoint throttles `lastUsedAt` writes, so the very first read after sign-in can mutate the row and change the body (and therefore the ETag). Skipping it makes the assertion flaky.
- The probe endpoint is `GET /account/sessions` specifically because the account router attaches the `noStore` header middleware there; other routes may not.
- The 304 response is expected to carry **no body** (`text === ''`) but **must** repeat the ETag and `no-store` header—this is the contract under test.
