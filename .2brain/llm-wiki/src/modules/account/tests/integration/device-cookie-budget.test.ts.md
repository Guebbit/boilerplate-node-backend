---
source: src/modules/account/tests/integration/device-cookie-budget.test.ts
sha256: 2fb75bb8d4f8df399acecb0bd9fe6968dd41a51b2d8e74d58e3197889bee0323
generated_at: 2026-10-29T02:54:57.209601+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/device-cookie-budget.test.ts

## Purpose

Integration tests for the per-account credential rate-limit budget and the `__Host-device` cookie that exempts a legitimate browser from that budget. Verifies that the cookie is issued only on successful login, that an owner's browser bypasses an exhausted account budget, that the cookie is scoped to the account it was issued for, and that a forged cookie draws on its own separate (small) budget rather than the account budget.

## Key elements

- **`withAccountRateLimits`** – wraps `withReloadedRateLimits` pre-bound to `@modules/account/rate-limits`, so each test can override env-var limits and receive the reloaded limiter instances.
- **`SMALL_ACCOUNT_BUDGET`** – env-var config that caps the per-account limit at 2 while keeping address, block, and device limits high, isolating the account budget under test.
- **`guess(app, email, cookie?)`** – sends a POST to `/route` with an email body; optionally attaches a `Cookie` header. Used to simulate credential-guessing requests against the trivial limiter app.
- **`deviceCookieAfterLogin(email)`** – performs a real login via `api()` and extracts the `__Host-device` cookie value from the response `Set-Cookie` header.
- **`describe('the device cookie, as issued')`** – single test asserting the cookie is set (HttpOnly) on success and absent on failure, using the real `/account/login` route.
- **`describe('the per-account credential budget')`** – five tests covering: stranger lockout at cap, owner-bypass via cookie, cross-account non-transfer, signed-in-owner guessing at a victim, and forged-cookie independent budget.

## Relationships

- **`src/modules/account/rate-limits.ts`** – the module under test; its `credentialLimiters` are the middleware exercised by every budget test.
- **`tests/support/rate-limit-harness.ts`** – provides `appAnswering` (builds a minimal Express app around the limiters), `statusOf` (fires a request and returns the status code), and `withReloadedRateLimits` (reloads the limiter module with overridden env vars).
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the test database at module load.
- **`tests/support/cookies.ts`** – `setCookie` extracts a named cookie from a response's `Set-Cookie` header.
- **`tests/support/http.ts`** – `api()` returns a supertest agent bound to the real application (used only by the cookie-issuance test).
- **`src/modules/users/tests/factories.ts`** – `createUser` provisions accounts; `PLAIN_PASSWORD` is the known password.
- **`tests/support/stub.ts`** – `asStub<AuthContext>` creates a minimal auth-context object for the cross-account signed-in-owner test.
- **`src/types/auth-context.ts` / `src/types/index.ts`** – the `AuthContext` type imported by the stub.

## Notes

- `afterEach(() => jest.resetModules())` inside the budget `describe` block is essential: it ensures each test gets a fresh limiter module instance with its own counters after the env-var override.
- Most tests hit the trivial `/route` handler (via `appAnswering`) rather than the real login route; only the cookie-issuance test exercises the actual route. This keeps budget tests independent of password-hashing and session logic.
- The forged-cookie test uses a distinct email address per request (`a@`, `b@`, `c@`) so that the 429 can only come from the device budget, not the per-account budget.
- `SMALL_ACCOUNT_BUDGET` sets `NODE_AUTH_RATE_LIMIT_MAX` to 2 (account cap) while keeping address/block/device caps at 500, preventing cross-budget interference.
