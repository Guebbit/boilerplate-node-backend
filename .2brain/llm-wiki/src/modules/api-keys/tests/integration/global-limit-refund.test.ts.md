---
source: src/modules/api-keys/tests/integration/global-limit-refund.test.ts
sha256: dddeea6c94da34fe78297803c34c22d42b17345f8c1746fb7c4c4190589e2092
generated_at: 2026-10-29T03:16:07.180431+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/global-limit-refund.test.ts

## Purpose

Integration test verifying that the global per-IP rate limiter "refunds" a request that carries a resolved API key, so the request is bounded by its own per-key budget rather than the shared per-IP budget. It proves that partners sharing one exit address each get independent per-key limits.

## Key elements

- **`withSmallBudgets`** — Wraps `withReloadedRateLimits` to re-import the rate-limit module with tiny budgets (`NODE_RATE_LIMIT_MAX: 2`, `NODE_API_KEY_RATE_LIMIT_MAX: 3`) and returns the two limiters (`rateLimiter`, `apiKeyLimiter`).
- **`resolveKey(apiKeyLimiter)`** — A middleware stand-in for `getAuth`'s credential branch. If the `x-test-key` header starts with `sk_valid_`, it sets `request.credentialId` and delegates to the API-key limiter; otherwise it calls `next()` untouched.
- **Test cases** (inside `describe('the global brake and a resolved api-key')`):
  - *valid key passes global limit up to its own limit* — 3 requests at the key budget succeed; the 4th is rejected by the **key** limiter.
  - *fake `sk_` key consumes anonymous budget* — keys that don't resolve count against the shared per-IP pool; a subsequent headerless request from the same IP is also 429.
  - *two keys behind one address get separate budgets* — each key independently exhausts its own 3-request budget.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — The module under test. The test imports `rateLimiter` (global per-IP) and `apiKeyLimiter` (per-key) via a dynamic `import()` inside `withSmallBudgets`.
- **`tests/support/rate-limit-harness.ts`** — Provides `appAnswering` (builds an Express app with the given middleware chain), `statusOf` (fires a supertest request and returns the status code), and `withReloadedRateLimits` (resets the Jest module registry, re-imports, and returns the fresh limiters).

## Notes

- `jest.resetModules()` runs in `afterEach`; each test gets a freshly loaded limiter module so budgets don't leak between cases.
- The stand-in `resolveKey` intentionally does **not** invoke the real `getAuth`; the file's doc comment explains the property under test belongs to the limiter, not the auth layer.
- All requests share the same `X-Forwarded-For: 203.0.113.5` to simulate a single client IP.
- The "fake key" test (`sk_fake_*`) exercises the negative path: keys that fail the `sk_valid_` prefix check are treated as anonymous and consume the shared per-IP budget.
