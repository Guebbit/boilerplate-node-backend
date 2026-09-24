---
source: tests/integration/observability-auth.test.ts
sha256: b625f39ebce6c809d0ba15ab692605f9eea9400167b2794849268c0811213cac
generated_at: 2026-09-23T20:04:55.865055+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/observability-auth.test.ts

## Purpose

Integration tests that verify the two observability endpoints enforce their respective authentication schemes. `/observability/events` (SSE) must require a valid, unrevoked admin refresh cookie; `/observability/metrics` must require the configured `NODE_METRICS_TOKEN` bearer token and deny all traffic when that token is unset.

## Key elements

- **`setupTestDb()`** — one-time database initialization before the test suite runs.
- **`signIn(role)`** — logs in through the real `/account/login` route and returns the created user plus the `jwt=` refresh cookie, used to seed authenticated requests.
- **`describe('GET /observability/events')`** — four cases covering: no cookie → 401, non-admin cookie → 403, forged cookie → 401, revoked token (stored tokens cleared directly via repository) → 401.
- **`withToken(token, run)`** (inside metrics block) — temporarily sets or deletes `process.env.NODE_METRICS_TOKEN`, builds a minimal Express app wired with `cookieParser` and the `isMetricsScraper` guard, then restores the environment variable in a `finally` block.
- **`describe('GET /observability/metrics')`** — cases for: correct bearer token → 200, missing/wrong/malformed token → 401 (via `it.each`), and no token configured → 503.

## Relationships

- **`tests/support/http.ts`** — supplies the `api()` helper used to issue requests against the running app (SSE tests and the `signIn` helper).
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()` called at module top-level to prepare a clean test database.
- **`src/modules/users/tests/factories.ts`** — exports `createUser`, `createAdminUser`, `PLAIN_PASSWORD`, and `userRepository`; the factories create seed users and the repository is used to directly revoke tokens in the SSE revocation test.
- **`src/modules/users/repository.ts`** — accessed through `userRepository.findByIdWithCredentials` and `userRepository.save` to simulate token revocation at the storage layer.

## Notes

- The SSE tests use **cookie** auth (not a bearer header) because the browser `EventSource` API cannot set custom headers; this mirrors the frontend's `withCredentials: true` usage.
- The revocation test mutates the user document directly via the repository rather than calling `POST /account/logout-all`, since that route requires a bearer token the test deliberately does not possess.
- The metrics guard is imported **dynamically** (`await import('@modules/observability/metrics-scraper')`) inside `withToken` so that env-var changes take effect before the middleware is evaluated.
- An unset `NODE_METRICS_TOKEN` produces **503** (not 401), encoding a "deny by default" policy: the endpoint is closed, not accidentally open.
