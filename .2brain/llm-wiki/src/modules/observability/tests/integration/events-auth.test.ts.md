---
source: src/modules/observability/tests/integration/events-auth.test.ts
source_sha256: fc9b74d8ac8c05bc09fed302c35389cf05025a6b5ee91cb2136358f60ec04612
context_sha256: 2358ec0dd0739305a82005c409c4081508cd8069cebb28e84e00e227e667f773
generated_at: 2026-11-22T06:04:24.332535+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/tests/integration/events-auth.test.ts

## Purpose
Integration tests for the session-cookie authentication of the `GET /observability/events` event stream (SSE). Because `EventSource` cannot set request headers, the stream authenticates via the `__Host-session` cookie. The file covers refusal of forged and revoked cookies, and verifies that an already-open stream keeps following its session family across a refresh rotation.

## Key elements
- `setupTestDb()` – sets up the test database for the suite.
- `signIn(role)` – creates an admin or plain user, logs in through the real route via `loginCompleting`, and returns `{ user, cookie }`, where `cookie` is the `__Host-session=` entry from `Set-Cookie`.
- `describe('GET /observability/events')`:
  - A forged cookie yields 401.
  - A validly signed but revoked token (sessions dropped via `dropAllSessions`) yields 401. This shows that signature alone is not enough: the token must still be a live session row.
- `describe('the recheck of an open stream')`:
  - Sets `NODE_CORS_ORIGIN` to `https://shop.example` before each test.
  - `connect(cookie)` mounts a small express app with `cookieParser` and `requirePermissionViaCookie('read', 'ObservabilitySnapshot')`. It returns the admitted request so it can be reused for rechecks.
  - "stays open across a refresh rotation": `POST /account/refresh` with the cookie, then `stillHoldsRuleViaCookie` on the original request resolves `true`.
  - "closes once its session family is revoked": after `dropAllSessions`, `stillHoldsRuleViaCookie` resolves `false`.

## Relationships
- `@kernel/middlewares/authorizations` – supplies `requirePermissionViaCookie` and `stillHoldsRuleViaCookie`, the guard and the periodic recheck under test.
- `@modules/users/tests/factories` – `createUser`, `createAdminUser`, and `PLAIN_PASSWORD` for seeding and logging in.
- `@modules/account/tests/factories` – `dropAllSessions` revokes sessions directly at the source.
- `@tests/http` – `api()` (the app client) and `loginCompleting` (real login flow).
- `@tests/environment` – `setEnvironment` sets the CORS origin.
- `@tests/setup-test-db` – `setupTestDb` provides database lifecycle.

## Notes
- Revocation is done via `dropAllSessions` rather than `DELETE /account/sessions`, since that endpoint needs a bearer token these tests don't have.
- The recheck is exercised by calling `stillHoldsRuleViaCookie` directly on the captured request, not by waiting for the 30-second timer. The comment states the recheck must follow the session's family, not the superseded cookie value.
- The refresh call sets `Origin` to the configured CORS origin.
- A leftover comment on `signIn` calls the cookie the `jwt` refresh cookie, but the code looks for `__Host-session=`.
