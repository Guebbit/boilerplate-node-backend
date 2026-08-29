# tests/integration/observability-auth.test.ts

## Purpose

Integration tests that verify the authentication and authorization behavior of the two observability endpoints (`GET /observability/events` and `GET /observability/metrics`). Each endpoint uses a different auth mechanism (cookie vs. bearer token) because of the constraints of its caller (SSE vs. Prometheus scraper), and the tests are split accordingly to confirm that unauthenticated, unprivileged, forged, and revoked credentials are all rejected.

## Key elements

- **`signIn(role)`** — Helper that creates a user via the test factory, posts to `/account/login`, and extracts the `jwt` refresh cookie from the `Set-Cookie` header.
- **`describe('GET /observability/events')`** — Four tests against the SSE endpoint:
  - No cookie → 401
  - Non-admin cookie → 403
  - Forged cookie → 401
  - Validly-signed but revoked token (tokens array wiped via `userRepository`) → 401
- **`withToken(token, run)`** — Helper that sets/unsets `NODE_METRICS_TOKEN`, builds a minimal Express app guarded by `isMetricsScraper`, runs a supertest request, then restores the original env value.
- **`describe('GET /observability/metrics')`** — Tests:
  - Correct bearer token → 200
  - Parametrized rejections: no header, wrong token, wrong-length token, malformed header → 401
  - `NODE_METRICS_TOKEN` unset → 503 (deny-by-default)

## Relationships

- **`tests/support/http.ts`** — Provides the `api()` supertest helper used for all `/observability/events` requests.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module level to seed and reset the database before tests run.
- **`src/modules/users/tests/factory.ts`** — Supplies `createUser`, `createAdminUser`, and `PLAIN_PASSWORD` for the `signIn` helper.
- **`src/modules/users/index.ts`** — Exports `userRepository`, used directly in the revocation test to clear `stored.tokens` and persist.
- **`src/modules/users/repository.ts`** — Backing implementation for `findByIdWithCredentials` and `save` called in the revocation test.

## Notes

- The metrics tests build their own Express instance with `cookieParser()` and the `isMetricsScraper` middleware (imported dynamically from `@infrastructure/http/middlewares/security`) rather than hitting the full app. This isolates the auth decision from route-level side effects.
- The revocation test bypasses `POST /account/logout-all` (which requires a bearer token the SSE client cannot send) and mutates the DB directly—intentionally, to prove that signature validity alone is insufficient.
- `withToken` restores the original `NODE_METRICS_TOKEN` in a `finally` block; tests that mutate `process.env` in parallel could interfere, but Jest runs test files serially by default here.
- The deny-by-default 503 (not 401/403) when the token is unset is a deliberate product decision: an unauthenticated metrics endpoint is a misconfiguration that should be loud, not silently open.
