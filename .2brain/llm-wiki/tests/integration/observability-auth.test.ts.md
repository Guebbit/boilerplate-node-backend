---
source: tests/integration/observability-auth.test.ts
sha256: e0e2972e7c4e7058d975e876077dac07ec544d74452620200055681b02aafbfd
generated_at: 2026-10-15T12:48:51.907833+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/observability-auth.test.ts

## Purpose

Integration tests that verify the authentication and authorization gates on the two observability endpoints (`GET /observability/events` and `GET /observability/metrics`). The file exists because neither endpoint should be reachable without valid credentials, and the two use fundamentally different auth mechanisms (session cookie vs. bearer token) that each need their own failure-mode coverage.

## Key elements

- **`signIn(role)`** – Logs in through the real `/account/login` route and extracts the `__Host-session` refresh cookie from `Set-Cookie`. Returns the created user and the cookie string.
- **`describe('GET /observability/events')`** – Four cases against the SSE endpoint: no cookie (401), non-admin cookie (403), forged cookie (401), and a validly-signed cookie whose session row has been deleted (401).
- **`describe('the recheck of an open stream')`** – Exercises `requirePermissionViaCookie` + `stillHoldsKeyViaCookie` on a throwaway Express app. Verifies an open SSE stream survives a `/account/refresh` rotation but is closed when the session family is revoked.
- **`withToken(token, run)`** – Wraps a test body in `withEnvironmentOverrides` to set `NODE_METRICS_TOKEN`, dynamically imports `isMetricsScraper`, and mounts it on a minimal Express app at `GET /metrics`.
- **`describe('GET /observability/metrics')`** – Four cases: correct bearer token (200), missing/wrong/malformed token (401), and no token configured at all (503, deny-by-default).

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** – Imports `requirePermissionViaCookie` (guards the events SSE route) and `stillHoldsKeyViaCookie` (re-validates an already-open stream on each tick).
- **`src/modules/observability/metrics-scraper.ts`** – Dynamically imports `isMetricsScraper` inside `withToken` so the guard can be tested against a configurable `NODE_METRICS_TOKEN`.
- **`src/modules/users/tests/factories.ts`** – Imports `createUser`, `createAdminUser`, and `PLAIN_PASSWORD` to seed accounts for sign-in.
- **`src/modules/account/tests/factories.ts`** – Imports `dropAllSessions` to revoke a session family without needing a bearer-token call to the logout route.
- **`tests/support/http.ts`** – Imports `api()` (supertest wrapper around the app under test) for route-level requests.
- **`tests/support/environment.ts`** – Imports `setEnvironment` and `withEnvironmentOverrides` to control `NODE_CORS_ORIGIN` and `NODE_METRICS_TOKEN` per test.
- **`tests/support/setup-test-db.ts`** – Calls `setupTestDb()` at module load to prepare a clean database for the whole suite.

## Notes

- **SSE cannot send headers.** The events endpoint is cookie-authenticated by design; the tests mirror this by asserting cookies are the only path in.
- **`setupTestDb()` runs at import time**, not inside a `before` hook, so it executes once for the entire file regardless of test order.
- **The recheck tests build a separate Express app** rather than hitting the real route, because they need a stable `express.Request` object to pass into `stillHoldsKeyViaCookie` after the initial request completes.
- **503 vs 401 on `/metrics`:** when `NODE_METRICS_TOKEN` is unset the endpoint returns 503 (service unavailable) rather than 401, signalling a misconfiguration rather than a credential failure.
- **`withToken` uses a dynamic `import()`** for `isMetricsScraper` so the guard reads the token from the environment at call time rather than at module-load time.
