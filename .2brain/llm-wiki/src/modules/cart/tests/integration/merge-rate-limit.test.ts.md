---
source: src/modules/cart/tests/integration/merge-rate-limit.test.ts
sha256: c1fb6aae99f82bf2c57f192a25908cd413fa75c19485d8b489d676f8d142eb48
generated_at: 2026-11-08T05:21:17.187753+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/merge-rate-limit.test.ts

## Purpose

Integration test that verifies the per-account rate-limiting behaviour of the merge limiter exposed by the cart module. It mounts `mergeLimiter` on a minimal Express route and asserts two properties: an account receives 429 after exhausting its budget, and one account's exhaustion does not starve a neighbouring account. The limiter is tested in isolation from the real route (see `../unit/routes.test.ts` for mount assertions).

## Key elements

- **`asAccount`** – A `RequestHandler` that stands in for `getAuth`; reads the `x-account` request header and attaches a stub `AuthContext` (only `.id` is set) to `request.authContext`.
- **`mergeAppWithBudget(limit: number)`** – Dynamically reimports `@modules/cart/rate-limits` with `NODE_CART_MERGE_RATE_LIMIT_MAX` overridden to `limit`, grabs `mergeLimiter`, and returns a pre-built Express app with a single `POST /merge` route.
- **`describe('the merge budget')`** – Contains two cases:
  - *429 after exhaustion*: fires 3 sequential requests as one account with budget 2, expects `[200, 200, 429]`.
  - *Per-account isolation*: budget 1; account "one" exhausts its slot, account "two" still gets 200.

## Relationships

- **`src/modules/cart/rate-limits.ts`** – The module under test. `mergeLimiter` is its named export; the test only reads its limiting behaviour, never its internal structure.
- **`src/types/auth-context.ts`** – Provides the `AuthContext` type that `asAccount` stamps onto the request, mimicking what the real auth middleware would do.
- **`src/types/index.ts`** – Re-exports `AuthContext`; the test imports it via `@types`.
- **`tests/support/rate-limit-harness.ts`** – Supplies `withReloadedRateLimits`, which resets the module registry, injects env-var overrides, and returns the freshly imported module so each test gets an independent limiter instance.
- **`tests/support/stub.ts`** – Supplies `asStub<T>`, used here to create a minimal `AuthContext` object with only `id` populated.

## Notes

- `afterEach(() => jest.resetModules())` is required because `withReloadedRateLimits` relies on dynamic `import()`; without the reset, the second test would reuse the first test's module instance and budget.
- The limiter is constructed once per test via `mergeAppWithBudget`; `rateLimit()` reads its options at construction time, so per-request reconfiguration is not possible.
- The test deliberately uses a trivial 200 JSON handler rather than the real cart merge logic—the stated intent is to test the *limiter's* property, not endpoint semantics.
