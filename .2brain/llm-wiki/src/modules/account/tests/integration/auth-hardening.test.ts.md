---
source: src/modules/account/tests/integration/auth-hardening.test.ts
source_sha256: 50f10e36a9511c65dc2ae97e2bac2ce680a270d3e7536893823c4496fcfb351f
context_sha256: 5302e7c55341d760266534570ca051168d8bd81956e778b66ab96c2b27ecc0d3
generated_at: 2026-11-22T03:52:34.749552+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/auth-hardening.test.ts

## Purpose
Integration tests for the properties owned by `src/modules/account/rate-limits.ts`: the credential-endpoint rate limiter (per-identity, per-address and per-block buckets) and the antibot challenge gate (`loginChallengeGate`). The global error handler is deliberately tested elsewhere, in the root-level `tests/integration/auth-hardening.test.ts`, because every module's uncaught throws pass through it.

## Key elements
- `setupTestDb()` is called at file level to provide the test database.
- `limitersWithBudget(identityLimit, addressLimit = identityLimit)` reloads the rate-limits module with small `NODE_AUTH_RATE_LIMIT_MAX` and `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX` values and returns `credentialLimiters`. The two budgets are settable separately so a case can leave one bucket with room.
- `appWithBudget(identityLimit)` takes `credentialLimiters` and `loginChallengeGate` from a single reload and mounts them on `POST /login`, with a handler that always answers 401. Both must come from the same module instance. The gate reads the property name that the identity limiter was configured with.
- `describe('credential endpoints are rate limited separately')` covers these cases:
  - 429 once the budget is spent (3 allowed, then 429).
  - Successful (200) attempts don't consume the budget (`skipSuccessfulRequests`).
  - One account's identity budget is independent of another account's at the same address.
  - The limiter is mounted on the real `/account/login` route, checked via the presence of the `ratelimit` (draft-7) header.
- `describe('loginChallengeGate — rung 3 on the block budget too')` covers this case:
  - With `NODE_ANTIBOT_PROVIDER=turnstile` and a block max of 4, one failure each from three different accounts produces 403 with code `ANTIBOT_VERIFICATION_FAILED` (credential stuffing).
- `describe('loginChallengeGate — rung 3 only once the identity budget is mostly spent')` covers these cases:
  - The gate never engages when no provider is set.
  - A first attempt passes through when a provider is set.
  - The gate challenges once failures reach half of the identity budget (the third attempt with a budget of 4).

## Relationships
- `src/modules/account/rate-limits.ts` is the module under test. It is dynamically imported after each env change and exports `credentialLimiters` and `loginChallengeGate`.
- `tests/support/rate-limit-harness.ts` provides `withReloadedRateLimits(importFn, env, select)`. It reloads the module with the given env vars so a small budget takes effect.
- `tests/support/environment.ts` provides `setEnvironment`, which sets or unsets `NODE_ANTIBOT_PROVIDER`.
- `tests/support/http.ts` provides `api()`, the client for the real-app `/account/login` test.
- `src/modules/users/tests/factories.ts` provides `createUser` and `PLAIN_PASSWORD`, used only in the real-route test.
- `tests/support/setup-test-db.ts` provides `setupTestDb`.

## Notes
- Most cases mount the limiters on a bare express app with a trivial handler instead of the real `postLogin`. This tests the limiter alone and avoids a database round trip per attempt.
- Every `describe` block calls `jest.resetModules()` in `afterEach`, so each test gets a freshly constructed limiter with a clean counter state.
- Failures are counted as 4xx responses. The handler returns 401 to stand in for a failed credential check.
- In the per-account test, the address budget is set to 50 so that only the identity bucket is observed.
- In the block test, per-account and per-address budgets are set to 100, so only the block budget can arm the gate.
