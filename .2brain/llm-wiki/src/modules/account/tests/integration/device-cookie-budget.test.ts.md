---
source: src/modules/account/tests/integration/device-cookie-budget.test.ts
sha256: 2fb75bb8d4f8df399acecb0bd9fe6968dd41a51b2d8e74d58e3197889bee0323
generated_at: 2026-11-08T04:35:40.724619+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/device-cookie-budget.test.ts

## Purpose

Integration tests for the per-account credential budget and the `__Host-device` familiar-device cookie. Verifies three security properties: a previously-seen device skips an exhausted account budget, a forged cookie gets its own small budget, and a valid session's cookie does not leak across accounts. Most cases run against stub handlers (the budget logic lives in the limiter, not the route); one case hits the real `/account/login` route to confirm cookie issuance.

## Key elements

- **`withAccountRateLimits`** — Thin wrapper around `withReloadedRateLimits` that dynamically imports `@modules/account/rate-limits` so each test gets a fresh module instance.
- **`SMALL_ACCOUNT_BUDGET`** — Config map: account max = 2, all other budgets = 500, isolating the account limiter under test.
- **`guess(app, email, cookie?)`** — Sends a wrong-password POST to the stub `/route`; optionally attaches a `Cookie` header.
- **`deviceCookieAfterLogin(email)`** — Performs a real login via `api()` and extracts the `__Host-device` Set-Cookie value.
- **`describe('the device cookie, as issued')`** — Asserts the cookie is set on success and absent on failure, and carries `HttpOnly`.
- **`describe('the per-account credential budget')`** — Five cases: lockout after cap; familiar-device bypass; cross-account cookie isolation; authenticated-attacker cross-account isolation; forged-cookie independent budget.

## Relationships

- **`src/modules/account/rate-limits.ts`** — Module under test; its `credentialLimiters` array is injected into stub apps via `appAnswering`.
- **`tests/support/rate-limit-harness.ts`** — Provides `appAnswering`, `statusOf`, and `withReloadedRateLimits` (the dynamic-import/reload mechanism).
- **`tests/support/cookies.ts`** — `setCookie` reads the `__Host-device` value from a response.
- **`tests/support/http.ts`** — `api()` builds a supertest agent against the real app for the issuance test.
- **`src/modules/users/tests/factories.ts`** — `createUser` and `PLAIN_PASSWORD` seed test accounts.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the database before any test runs.
- **`tests/support/stub.ts`** — `asStub<AuthContext>` wraps a plain object to satisfy the `AuthContext` type in the authenticated-attacker case.
- **`src/types/auth-context.ts`** / **`src/types/index.ts`** — `AuthContext` type used in the stub assertion.

## Notes

- `afterEach(() => jest.resetModules())` is required because `withAccountRateLimits` uses `import()` to obtain a fresh limiter instance each call; without the reset, the module cache would return the same (already-consumed) limiters.
- The "forged cookie" test deliberately sets `NODE_AUTH_RATE_LIMIT_MAX: '500'` (well above the 3 attempts) so the 429 can only come from the device budget (`DEVICE_MAX: '2'`), proving the two budgets are independent.
- The authenticated-attacker test injects a fake `authContext` middleware *before* the limiters, simulating a valid session while the request body targets a different account.
