---
source: src/modules/api-keys/tests/integration/global-limit-refund.test.ts
source_sha256: dddeea6c94da34fe78297803c34c22d42b17345f8c1746fb7c4c4190589e2092
context_sha256: d5f0253a041a39202851df3d10409b54e10dd9bef35d4dc462d92d1349e940d7
generated_at: 2026-11-22T04:24:36.026503+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/tests/integration/global-limit-refund.test.ts

## Purpose
Integration test verifying that the global browsing rate limiter "refunds" requests carrying a resolved api-key, so partners sharing one exit IP are bound by their own per-key budget rather than a shared global one. It runs against a trivial handler rather than `getAuth`, since the behavior belongs to the limiter itself.

## Key elements
- `withSmallBudgets()`: loads a fresh copy of `@infrastructure/http/middlewares/rate-limit` via `withReloadedRateLimits`, with `NODE_RATE_LIMIT_MAX=2` and `NODE_API_KEY_RATE_LIMIT_MAX=3`, and returns `{ rateLimiter, apiKeyLimiter }`.
- `resolveKey(apiKeyLimiter)`: stand-in middleware for `getAuth`'s credential branch. If the `x-test-key` header starts with `sk_valid_`, it sets `request.credentialId` and calls `apiKeyLimiter`. Otherwise it just calls `next()`.
- Test suite `the global brake and a resolved api-key`, with `afterEach(() => jest.resetModules())`:
  - **Valid key passes the global limit:** with a global budget of 2 and a key budget of 3, three requests return 200 and the fourth returns 429 (the key's own refusal).
  - **Fake key is treated as anonymous:** `sk_fake_*` keys are not resolved, so they spend the shared anonymous budget. The third request gets 429, and a later request with no header from the same address also gets 429.
  - **Two keys behind one address:** `sk_valid_a` and `sk_valid_b` each get 3 successes (interleaved), then both get 429.

## Relationships
- `src/infrastructure/http/middlewares/rate-limit.ts`: the module under test. It exports `rateLimiter` (global) and `apiKeyLimiter` (per-key), and is imported dynamically so the env-var budgets take effect.
- `tests/support/rate-limit-harness.ts` (imported as `@tests/rate-limit-harness`): provides `withReloadedRateLimits` (reloads the module with env overrides), `appAnswering` (builds an app with a fixed response and the given middlewares) and `statusOf` (resolves a request's status).

## Notes
- All requests use `X-Forwarded-For: 203.0.113.5` to simulate a shared exit address.
- `jest.resetModules()` after each test, together with the fresh import, keeps limiter counters from leaking between tests.
- The middleware order is `rateLimiter` first, then `resolveKey(apiKeyLimiter)`. The refund is exercised only through the `request.credentialId` that the stand-in sets.
