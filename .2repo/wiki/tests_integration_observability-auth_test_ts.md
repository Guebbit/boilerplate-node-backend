# tests/integration/observability-auth.test.ts

## Purpose

Integration tests for the two observability endpoints (`GET /observability/events` and `GET /observability/metrics`), verifying that each one's distinct authentication scheme correctly accepts legitimate callers and rejects every form of unauthorized or malformed access.

## Key elements

- **`signIn(role)`** — Helper that creates a user (admin or regular) via fixtures, performs a real `POST /account/login`, and returns the user record plus the `jwt=` refresh cookie from the `Set-Cookie` header.
- **`describe('GET /observability/events')`** — Four tests confirming the SSE endpoint rejects: no cookie (401), non-admin cookie (403), forged cookie (401), and a validly-signed-but-revoked token (401).
- **`describe('GET /observability/metrics')`** — Tests the scraper-token endpoint: accepts the configured `NODE_METRICS_TOKEN` bearer (200), rejects missing/wrong/length-mismatched/malformed tokens (401), and returns 503 when the env var is unset (deny-by-default).
- **`withToken(token, run)`** — Saves and restores `process.env.NODE_METRICS_TOKEN`, dynamically imports `isMetricsScraper` from `@infrastructure/http/middlewares/rate-limit`, mounts it on a throwaway Express app, and hands that app to the test callback.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is invoked at module top level to prepare the test database before any test runs.
- **`tests/support/http.ts`** — `api` is imported as the supertest-wrapped application under test for all event-endpoint requests and the login call.
- **`src/modules/users/tests/fixtures.ts`** — `createUser`, `createAdminUser`, and `PLAIN_PASSWORD` supply the seed credentials used by `signIn`.
- **`src/modules/users/index.ts`** — Re-exports `userRepository`, which is imported here.
- **`src/modules/users/repository.ts`** — `userRepository.findByIdWithCredentials` and `.save` are called in the revoked-token test to directly clear `stored.tokens` on the user document (simulating revocation without needing the bearer-token-based logout route).

## Notes

- The events endpoint is tested with cookie auth exclusively because `EventSource` cannot set request headers; the metrics endpoint uses a standard `Authorization: Bearer` header.
- The metrics tests spin up a **separate** Express instance (not the main app) to isolate the `isMetricsScraper` middleware and the env-var lifecycle.
- The revoked-token test bypasses `POST /account/logout-all` deliberately — that route requires a bearer token the SSE test client does not possess. The assertion is narrower: a signature that is still cryptographically valid but whose backing record is gone must not grant access.
- `setupTestDb()` runs at import time (module-level side effect), so test isolation depends on the test runner's per-file isolation.
