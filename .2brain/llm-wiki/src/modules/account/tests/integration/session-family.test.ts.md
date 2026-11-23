---
source: src/modules/account/tests/integration/session-family.test.ts
source_sha256: 1b3b4a50f571afaffc39917d2d6e503dd904c6fe89b453c24538999824eabd3b
context_sha256: a9fb1969955c8affbdb312b39c6215a4f650e2254ca58ee099bf68c79ec1fc03
generated_at: 2026-11-22T04:01:23.464179+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/session-family.test.ts

## Purpose
Integration tests verifying that a session keeps a single, stable id across refresh-token rotation. Every refresh creates a new token row, so an id derived from the row would go stale after the first rotation. In that case, "log out that device" would target the dead predecessor, report success, and leave the device signed in. The file also checks that reuse detection revokes the whole session family.

## Key elements
- `setupTestDb()` / `beforeEach` — sets up the test database and sets `NODE_MAIL_TRANSPORT` to `'outbox'` before each test.
- `loginAs(email)` — posts to `/account/login` with `PLAIN_PASSWORD`. Returns a `Bearer` access token and the `__Host-session` refresh cookie as a `Cookie` header value.
- `refresh(cookie)` — posts to `/account/refresh` with the given cookie.
- `sessionIds(bearer)` — returns the sorted ids from `GET /account/sessions`.
- `describe('a session id across a refresh rotation')`
  - The id listed before a rotation equals the id listed after it, and the refresh returns 200.
  - Revoking a session through `DELETE /account/sessions/:id` still works when the id was read before the target rotated. The response is 204, the target's rotated cookie then gets 401 on refresh, and the revoking device's own cookie still refreshes with 200.
- `describe('reuse detection with a session family')`
  - Uses `startSession` and `rotateRefreshToken` directly, with `NODE_TOKEN_ROTATION_GRACE_MS=1000` and `NODE_TOKEN_REUSE_WINDOW_MS=600000`, under a frozen clock.
  - After the clock is advanced 5000 ms, replaying the superseded token rejects with `TokenReuseError`. The rotated successor token is then rejected too.
  - `afterEach` restores real timers.

## Relationships
- `src/modules/account/session/jwt.ts` — provides `startSession`, `rotateRefreshToken` and `TokenReuseError`, which are called directly in the reuse-detection test.
- `src/modules/users/tests/factories.ts` — provides `createUser` (with `verifiedAt` set) and `PLAIN_PASSWORD`.
- `src/types/index.ts` — provides `RememberTier`, whose `short` member is passed to `startSession`.
- `tests/support/http.ts` — provides `api()`, the HTTP client used for the endpoint calls.
- `tests/support/cookies.ts` — provides `cookieHeader(response, name)`, which extracts the session cookie.
- `tests/support/environment.ts` — provides `setEnvironment` and `withEnvironmentOverrides`.
- `tests/support/clock.ts` — provides `freezeDate` and `advanceDate`.
- `tests/support/setup-test-db.ts` — provides `setupTestDb`.

## Notes
- The revoke test reads the target session id before `other` rotates, so the id must keep naming the same device afterwards.
- The reuse test relies on replaying the superseded token after the grace window, which is treated as theft. A replay inside the window is not tested here.
- The imports use path aliases (`@types`, `@tests/*`, `@modules/*`) alongside relative imports.
