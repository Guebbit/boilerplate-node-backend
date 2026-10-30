---
source: src/modules/observability/tests/integration/events-auth.test.ts
sha256: 652a890ca10174fe54d235efc1fefdcc0ffb5e10f391f60e8b2cfe0092bb49d5
generated_at: 2026-10-29T04:36:58.377667+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/integration/events-auth.test.ts

## Purpose

Integration tests that verify the `/observability/events` SSE stream's cookie-based authentication. Because `EventSource` cannot set request headers, the stream authenticates exclusively via the `__Host-session` cookie. These tests confirm that forged cookies and revoked sessions are refused, and that the periodic recheck of an open stream tracks the session *family* (surviving refresh rotation) rather than the original cookie value.

## Key elements

- **`signIn(role)`** — Logs in through the real login route, extracts the `__Host-session` refresh cookie from the `Set-Cookie` header, and returns the created user plus that cookie.
- **`describe('GET /observability/events')`** — Two tests: one asserting a forged cookie yields `401`, one asserting a still-signed token whose DB row has been deleted (via `dropAllSessions`) also yields `401`.
- **`connect(cookie)`** — Builds a minimal Express app wired with `cookieParser` and the `requirePermissionViaCookie` guard, fires a supertest request, and returns the admitted `express.Request` for later recheck.
- **`describe('the recheck of an open stream')`** — Two tests: one asserting `stillHoldsRuleViaCookie` resolves `true` after a `/account/refresh` rotation (same family), one asserting it resolves `false` after the family is revoked.
- **`setupTestDb()`** — Runs once at module load to reset the test database.
- **`setEnvironment({ NODE_CORS_ORIGIN: FRONTEND })`** — Set in `beforeEach` for the recheck suite so the refresh call passes CORS.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — The system under test. `requirePermissionViaCookie` is the guard the stream connects through; `stillHoldsRuleViaCookie` is the recheck function exercised after rotation/revocation.
- **`tests/support/http.ts`** — Provides `api()` (supertest against the real app) and `loginCompleting` (full login flow including OTP step).
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb` for a clean database per test run.
- **`tests/support/environment.ts`** — Provides `setEnvironment` to override process-level config (CORS origin) within the recheck suite.
- **`src/modules/users/tests/factories.ts`** — Provides `createUser`, `createAdminUser`, and `PLAIN_PASSWORD` for seeding test accounts.
- **`src/modules/account/tests/factories.ts`** — Provides `dropAllSessions` to revoke session rows directly in the DB (bypassing the bearer-token-protected `DELETE /account/sessions` route).

## Notes

- The revoked-token test deletes the session row directly in the DB rather than calling `DELETE /account/sessions`, because that endpoint requires a bearer token the test does not hold. The comment makes this intentional.
- The recheck tests use `admin` role and the permission tuple `('read', 'ObservabilitySnapshot')`; changing either without updating the guard wiring will break the suite.
- `setEnvironment` is scoped to `beforeEach` in the recheck `describe` only; the first `describe` does not set a custom CORS origin because it never calls `/account/refresh`.
- The cookie is always the `__Host-session` cookie (refresh token), not a short-lived access token—this mirrors how `EventSource` would behave in a browser.
