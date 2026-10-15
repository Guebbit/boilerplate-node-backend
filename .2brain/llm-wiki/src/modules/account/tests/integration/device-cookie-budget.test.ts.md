---
source: src/modules/account/tests/integration/device-cookie-budget.test.ts
sha256: ef6135809593ec6cdf1dc3db2d8a0780d8d7dbf83913f0a53470c9dc3df88370
generated_at: 2026-10-15T10:10:58.072208+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/device-cookie-budget.test.ts

## Purpose

Integration tests for the per-account credential rate-limit budget and the `device` cookie that exempts a previously-authenticated browser from that budget. Verifies that a familiar browser bypasses an exhausted account budget, a forged cookie draws from its own smaller budget, and cross-account or cross-identity scenarios do not leak exemptions. Most tests run against trivial stub handlers (the budget logic lives in the limiter module); one test exercises the real `/account/login` route to confirm cookie issuance.

## Key elements

- **`withAccountRateLimits`** — Thin wrapper around `withReloadedRateLimits` that dynamically imports `@modules/account/rate-limits` so `jest.resetModules()` can re-load it between tests.
- **`SMALL_ACCOUNT_BUDGET`** — Env-var overrides that set the account credential cap to 2 while keeping all other budgets (address, block, device) high, isolating the account limiter.
- **`guess`** — Sends a wrong-password POST to `/route` on the harness app; optionally attaches a `Cookie` header.
- **`deviceCookieAfterLogin`** — Performs a real login via `api()` against `/account/login`, extracts the `device` `Set-Cookie` value, and returns it as a `Cookie` header string.
- **`describe("the device cookie, as issued")`** — Asserts the cookie is `HttpOnly`, set on success, and absent on failure.
- **`describe("the per-account credential budget")`** — Five cases: stranger lockout at the cap; owner's browser bypassing an exhausted budget; cookie not transferring to another account; owner's session not exempting guesses at a victim's account; forged cookie consuming its own small device budget while cookieless requests are unaffected.

## Relationships

- **`src/modules/account/rate-limits.ts`** — The module under test; dynamically imported inside `withAccountRateLimits` so its limiters can be swapped per test.
- **`src/modules/users/tests/factories.ts`** — Provides `createUser` and `PLAIN_PASSWORD` for provisioning test accounts and a known-correct credential.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — `AuthContext` type used to shape the stubbed `request.authContext` in the cross-identity test.
- **`tests/support/cookies.ts`** — `setCookie` reads the `Set-Cookie` header for a named cookie.
- **`tests/support/http.ts`** — `api()` builds a real supertest agent for the two tests that hit the actual login route.
- **`tests/support/rate-limit-harness.ts`** — `appAnswering` assembles an Express app from a status, a success flag, and limiter middleware; `statusOf` fires a request and returns the status code; `withReloadedRateLimits` handles module re-loading.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory database before tests run.
- **`tests/support/stub.ts`** — `asStub` creates a read-only object shaped like `AuthContext` for injection into the request.

## Notes

- `afterEach(() => jest.resetModules())` in the budget suite is required so each test gets a fresh limiter instance; forgetting it causes budget state to leak between tests.
- The forged-cookie test intentionally sets `NODE_AUTH_RATE_LIMIT_MAX` to 500 (not 2) so that only the device-budget cap of 2 can trigger the 429, proving the two budgets are independent.
- The cross-identity test injects `authContext` via a middleware in `appAnswering`, simulating an already-authenticated attacker; this is the only test that goes beyond a bare 401 handler.
- `deviceCookieAfterLogin` splits the `Set-Cookie` header on `;` and takes the first segment, so attribute flags (e.g. `HttpOnly`, `Path=/`) are stripped from the returned value.
