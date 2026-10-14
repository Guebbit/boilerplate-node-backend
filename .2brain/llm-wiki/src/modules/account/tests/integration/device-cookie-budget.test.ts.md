---
source: src/modules/account/tests/integration/device-cookie-budget.test.ts
sha256: 440d721dd3131542ea0106af602645e85a2e6781029d3d123d3fdc818f2cec53
generated_at: 2026-10-14T09:08:55.844673+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/device-cookie-budget.test.ts

## Purpose

Integration tests for the per-account credential budget and the familiar-device cookie. Verifies three guarantees: a browser that previously signed in from the same account bypasses an exhausted budget, a forged or unknown device cookie gets its own small independent budget, and a repeated lockout applies to each account independently. Most cases run against trivial `appAnswering` handlers (the limiter property); one block exercises the real `/account/login` route to confirm the cookie's issuance semantics.

## Key elements

- **`withAccountRateLimits`** – Wraps `withReloadedRateLimits` with a dynamic import of `@modules/account/rate-limits`, so each test can reload the module with different env overrides.
- **`SMALL_ACCOUNT_BUDGET`** – Env-map that caps the account credential budget at 2 while keeping address, block, and device budgets at 500, isolating the behavior under test.
- **`guess(app, email, cookie?)`** – Sends a wrong-password POST to `/route`; optionally attaches a `Cookie` header for device-identification.
- **`deviceCookieAfterLogin(email)`** – Performs a real successful login via `api()` and extracts the `device` value from the `Set-Cookie` header.
- **`describe('the device cookie, as issued')`** – Asserts the cookie is present (HttpOnly) after a successful login and absent after a failed one.
- **`describe('the per-account credential budget')`** – Four cases: lockout at the cap; owner's cookie bypasses an exhausted budget; one account's cookie does not extend to another; a forged cookie draws from its own small device budget while cookie-less requests are unaffected.

## Relationships

- **`src/modules/account/rate-limits.ts`** – The module under test. Dynamically imported inside `withAccountRateLimits` so each test can see a fresh module instance with overridden env values.
- **`tests/support/rate-limit-harness.ts`** – Supplies `appAnswering`, `statusOf`, and `withReloadedRateLimits`, the three primitives every limiter suite in the project builds on.
- **`tests/support/http.ts`** – Provides `api`, the supertest agent bound to the real app, used for the one real-route cookie-issuance test and for `deviceCookieAfterLogin`.
- **`tests/support/cookies.ts`** – Provides `setCookie`, which parses a `Set-Cookie` header by cookie name and returns the raw header string (or `undefined`).
- **`src/modules/users/tests/factories.ts`** – Supplies `createUser` and `PLAIN_PASSWORD` so tests can create a known account with a known credential.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module top-level to ensure a clean database before any test runs.

## Notes

- `jest.resetModules()` in `afterEach` is required: without it the dynamic `import('@modules/account/rate-limits')` inside `withReloadedRateLimits` would return the cached module and env overrides would not take effect between tests.
- The forged-cookie test deliberately raises `NODE_AUTH_RATE_LIMIT_MAX` to 500 so the 429 can only originate from the device-cookie budget (`NODE_AUTH_RATE_LIMIT_DEVICE_MAX: 2`), not from the account budget.
- `guess` posts to a bare `/route` path, not a real endpoint; the handler's response body is irrelevant—only the status code matters. This keeps the limiter logic under test decoupled from account-domain logic.
