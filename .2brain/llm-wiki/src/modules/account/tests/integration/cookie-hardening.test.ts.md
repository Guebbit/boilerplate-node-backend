---
source: src/modules/account/tests/integration/cookie-hardening.test.ts
source_sha256: fd0960a1e61400ad4746003ba2820e255eef2846d8963ba08ae6fff97ff68ffe
context_sha256: f2e5260433ad07b5c4840b8be354796c4de1a2a7b5fa0399f62913731656be04
generated_at: 2026-11-22T03:53:28.601833+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/cookie-hardening.test.ts

## Purpose
Integration tests for the cookie-related hardening of the account module. They check that the refresh cookie is `__Host-` prefixed, that refresh is POST-only, and that the three endpoints a cookie alone authenticates (refresh, logout, the SSE streams) refuse a foreign `Origin` outright.

## Key elements
- `FRONTEND` (`https://shop.example`): the one origin set as `NODE_CORS_ORIGIN` for this file. A `beforeEach` applies it through `setEnvironment`.
- `login()`: creates a verified user with `createUser`, posts to `/account/login`, and returns `{ user, response, cookie }`. `cookie` is the `__Host-session` value built by `cookieHeader`.
- `describe('the refresh cookie')`: the login's `__Host-session` `Set-Cookie` must be `Secure`, `HttpOnly` and `Path=/`, with no `Domain`. No `jwt` cookie may be set.
- `describe('POST /account/refresh')`:
  - Returns 200 both for the frontend origin and for no `Origin` header (the second call reuses the rotated cookie).
  - Returns 403 for `https://evil.example`, and the user's session rows are unchanged (same count, none superseded).
  - A GET returns 405 with `Allow: OPTIONS, POST`.
- `describe('POST /account/logout')`: returns 204 from the frontend origin. A foreign origin gets 403 and the session rows remain.
- `describe('the SSE streams...')`: `it.each` over `/observability/events` and `/notifications/stream`. A foreign origin gets 403, even with a valid cookie.

## Relationships
- `tests/support/http.ts`: provides `api()`, the HTTP client used for every request.
- `tests/support/setup-test-db.ts`: `setupTestDb()` prepares the test database.
- `tests/support/environment.ts`: `setEnvironment` sets `NODE_CORS_ORIGIN` before each test.
- `tests/support/cookies.ts`: `setCookie` reads the raw `Set-Cookie`, and `cookieHeader` builds the `Cookie` header from a response.
- `src/modules/users/tests/factories.ts`: `createUser` and `PLAIN_PASSWORD` for creating a login-capable user.
- `src/modules/account/tests/factories.ts`: `sessionRowsOf(userId)` reads session rows to confirm nothing was rotated or revoked.

## Notes
- The foreign-origin tests assert 403 for a valid cookie. The SSE test title says the origin is refused "before it looks at the cookie".
- The refresh "no Origin" case reads the rotated cookie from the first response's `set-cookie`, falling back to the original cookie.
