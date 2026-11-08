---
source: src/modules/observability/tests/integration/events-auth.test.ts
sha256: 652a890ca10174fe54d235efc1fefdcc0ffb5e10f391f60e8b2cfe0092bb49d5
generated_at: 2026-11-08T06:42:12.391898+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/integration/events-auth.test.ts

## Purpose

Integration tests for the `GET /observability/events` SSE endpoint's cookie-based authentication path. Because `EventSource` cannot set custom request headers, the stream authenticates solely via the `__Host-session` cookie; these tests verify that forged tokens, revoked sessions, and token rotation are handled correctly for both the initial connection and the periodic recheck of an already-open stream.

## Key elements

- **`signIn(role)`** — logs in through the real login route, returns the created user and the extracted `__Host-session=…` cookie value.
- **`describe('GET /observability/events')`** — two cases: a forged cookie yields 401; a validly-signed token whose session row has been deleted (via `dropAllSessions`) also yields 401.
- **`describe('the recheck of an open stream')`** — uses a local Express app wired with `cookieParser` and `requirePermissionViaCookie` to simulate the guard, then calls `stillHoldsRuleViaCookie` on the captured request to assert the recheck outcome after a refresh rotation or a full session-family revocation.
- **`connect(cookie)`** (inner helper) — builds a throwaway Express instance, runs the real authorization middleware against a single `/stream` route, and returns the admitted `express.Request` for later recheck.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — imports `requirePermissionViaCookie` (guards the simulated stream route) and `stillHoldsRuleViaCookie` (performs the 30-second recheck assertion).
- **`src/modules/users/tests/factories.ts`** — imports `createUser`, `createAdminUser`, `PLAIN_PASSWORD` to provision test accounts.
- **`src/modules/account/tests/factories.ts`** — imports `dropAllSessions` to revoke sessions directly in the DB (the HTTP revocation route requires a bearer token the test does not hold).
- **`tests/support/http.ts`** — imports `api` (supertest wrapper for the main app) and `loginCompleting` (drives the real login flow to obtain the session cookie).
- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` at module scope to seed a clean database before any test runs.
- **`tests/support/environment.ts`** — calls `setEnvironment({ NODE_CORS_ORIGIN })` in `beforeEach` so the CORS guard accepts the `Origin` header sent with the refresh request.

## Notes

- The `__Host-session` cookie prefix implies `Secure` + `SameSite=Strict` in production; the test relies on the browser-level semantics being irrelevant to the server-side check.
- Revocation is performed by deleting the session row directly (`dropAllSessions`) rather than via `DELETE /account/sessions`, because that endpoint expects a bearer token the test intentionally does not possess.
- The recheck test asserts on **session-family** continuity, not on the specific token string: after a refresh the old cookie value is gone, yet `stillHoldsRuleViaCookie` must still resolve `true` because it tracks the family.
- `setupTestDb()` is called at top level (not in `beforeEach`), so it runs once per test file load.
