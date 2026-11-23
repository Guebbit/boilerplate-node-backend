---
source: src/modules/account/tests/integration/device-cookie-budget.test.ts
source_sha256: 811ea5efc7f8bec84ed87a522280c4bb4c3daf6f81e709fa3058689ae5b8aa35
context_sha256: af89a2d4534cc83a6bf054b61e4547179ff19941acd0b028dbd5409030ad7e85
generated_at: 2026-11-22T03:54:03.858335+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/device-cookie-budget.test.ts

## Purpose
Integration tests for the per-account login budget and the familiar-device cookie (`__Host-device`). They check that a browser which previously signed in to an account keeps working after an attacker has exhausted that account's budget, so the limiter can't be used to lock the owner out. They also check that a forged cookie gets its own small budget. Most tests run against trivial handlers wrapped in the real limiters. One test group calls the real `/account/login` route to check when the cookie is issued.

## Key elements
- `withAccountRateLimits(overrides, pick)` — wraps `withReloadedRateLimits` to re-import `@modules/account/rate-limits` with env overrides, then returns whatever `pick` selects (here `credentialLimiters`).
- `SMALL_ACCOUNT_BUDGET` — env overrides that set the per-account cap (`NODE_AUTH_RATE_LIMIT_MAX`) to 2. The address, block and device caps are set to 500 so they stay out of the way.
- `guess(app, email, cookie?)` — POSTs `{ email }` to `/route` on a test app, optionally with a `Cookie` header.
- `deviceCookieAfterLogin(email)` — logs in through the real `/account/login` with `PLAIN_PASSWORD`, reads the `__Host-device` Set-Cookie header, and returns it as a `name=value` string. It throws if no cookie was set.
- Test groups:
  - **"the device cookie, as issued"** — a successful login sets an `HttpOnly` device cookie. A failed login sets none.
  - **"the per-account credential budget"** — covers these cases:
    - A stranger gets 401, 401, then 429 at the cap of 2.
    - The owner's cookie still gets 401 while the budget is exhausted.
    - One account's cookie doesn't help against another account (`victim@example.com` still gets 429).
    - A signed-in owner, simulated by a middleware that sets an `AuthContext` stub, gets no exemption when guessing at someone else's account.
    - A forged cookie is limited by its own device budget (cap 2). A request with no cookie isn't counted in that budget.

## Relationships
- `src/modules/account/rate-limits.ts` — the module under test. It is dynamically re-imported per test to pick up env overrides, and its `credentialLimiters` are mounted on the test app.
- `tests/support/rate-limit-harness.ts` — provides `appAnswering`, `statusOf` and `withReloadedRateLimits`.
- `tests/support/http.ts` (`api`) — the real app client, used for login.
- `tests/support/cookies.ts` (`setCookie`) — extracts a named Set-Cookie header from a response.
- `tests/support/setup-test-db.ts` — `setupTestDb()` sets up the test database.
- `src/modules/users/tests/factories.ts` — `createUser` and `PLAIN_PASSWORD`.
- `tests/support/stub.ts` (`asStub`) and `src/types` (`AuthContext`) — build the fake auth context in the signed-in-attacker test.

## Notes
- `afterEach(() => jest.resetModules())` is needed because the limiters are reloaded with different env settings in each test.
- Tests that need a device cookie call `createUser` and log in first, then build the limiters. The limiters are reloaded after the login. This keeps the login from being limited under the small budgets.
- `appAnswering(401, true, ...)` builds the test app. The file doesn't show what its arguments mean.
- `src/types/auth-context.ts` is a graph neighbor, but this file imports only from `@types`.
