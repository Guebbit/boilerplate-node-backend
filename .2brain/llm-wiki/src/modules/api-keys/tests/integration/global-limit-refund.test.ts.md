---
source: src/modules/api-keys/tests/integration/global-limit-refund.test.ts
sha256: dddeea6c94da34fe78297803c34c22d42b17345f8c1746fb7c4c4190589e2092
generated_at: 2026-11-08T05:05:44.027098+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/integration/global-limit-refund.test.ts

## Purpose

Integration test verifying the "global browsing brake" refund behavior: a request carrying a resolved API key is exempt from the shared per-IP rate limit and is instead bounded by its own per-key budget. Ensures partners sharing one egress address don't starve each other on the global cap of 100.

## Key elements

- **`withSmallBudgets()`** — Reloads the rate-limit module with tiny test budgets (`NODE_RATE_LIMIT_MAX: '2'`, `NODE_API_KEY_RATE_LIMIT_MAX: '3'`) and returns the two limiters (`rateLimiter`, `apiKeyLimiter`).
- **`resolveKey(apiKeyLimiter)`** — A stand-in middleware that mimics `getAuth`'s credential branch: checks the `x-test-key` header for the `sk_valid_` prefix, sets `request.credentialId`, then hands off to `apiKeyLimiter`. Non-matching or missing keys pass through untouched.
- **`'lets a valid key past the global limit, up to its own limit'`** — 3 requests with the same valid key from one IP all succeed; the 4th is refused by the *key* limiter (429), not the global one.
- **`'caps a fake sk_ key like a request with no header at all'`** — Keys that don't match `sk_valid_*` consume the shared anonymous IP budget (2), after which even a header-less request from that IP is 429'd.
- **`'gives two keys behind one address a budget each'`** — Two distinct valid keys alternate 3 requests each from the same IP without interfering; the 4th call on either key hits its own 429.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — The module under test. The test dynamically imports it via `withReloadedRateLimits` to obtain `rateLimiter` (per-IP global cap) and `apiKeyLimiter` (per-key cap) with overridden budgets.
- **`tests/support/rate-limit-harness.ts`** — Supplies the three utilities the test builds its Express app and assertions on: `appAnswering` (wraps limiters in a trivial handler), `statusOf` (extracts the HTTP status from a supertest response), and `withReloadedRateLimits` (module-reload + env-injection helper).

## Notes

- `jest.resetModules()` runs in every `afterEach`, so each test gets a freshly evaluated rate-limit module; without it, the in-memory counters would leak between cases.
- The test intentionally avoids exercising `getAuth`; the property being tested (key-exempt refund) lives on the limiter side. The stand-in only needs to set `request.credentialId` the way a resolved key would.
- The `X-Forwarded-For` header is hardcoded to `203.0.113.5` in every call to simulate a single shared egress IP.
