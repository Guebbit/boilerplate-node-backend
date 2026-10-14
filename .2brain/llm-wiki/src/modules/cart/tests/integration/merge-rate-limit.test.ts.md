---
source: src/modules/cart/tests/integration/merge-rate-limit.test.ts
sha256: c1fb6aae99f82bf2c57f192a25908cd413fa75c19485d8b489d676f8d142eb48
generated_at: 2026-10-14T15:16:29.348484+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/merge-rate-limit.test.ts

## Purpose

Integration test that verifies the per-account merge rate limiter (`mergeLimiter`) enforces its budget on `POST /cart/merge`: it returns 429 once an account's allowance is exhausted and keeps accounts isolated from each other. It uses a trivial success handler because the property under test belongs to the limiter itself; route mounting is asserted separately in `../unit/routes.test.ts`.

## Key elements

- **`asAccount`** — Express `RequestHandler` that populates `request.authContext` with a stub whose only read field is `.id`, sourced from the `x-account` request header (defaults to `'anonymous'`).
- **`mergeAppWithBudget(limit)`** — Dynamically re-imports `@modules/cart/rate-limits` via `withReloadedRateLimits` with `NODE_CART_MERGE_RATE_LIMIT_MAX` set to `limit`, then wires `mergeLimiter` onto a minimal Express app's `POST /merge` route.
- **`describe('the merge budget')`** — Two specs:
  - *429 after exhaustion*: sends 3 requests as one account against a budget of 2; expects `[200, 200, 429]`.
  - *Account isolation*: budget of 1; account `'one'` gets 200 then 429 while account `'two'` still gets 200.
- **`afterEach`** — Calls `jest.resetModules()` to clear the dynamically cached module between tests.

## Relationships

- **`src/modules/cart/rate-limits.ts`** — The module under test. `mergeLimiter` is dynamically imported and applied as middleware before the route handler.
- **`src/types/auth-context.ts`** / **`src/types/index.ts`** — Provides the `AuthContext` type that `asAccount` stubs; the limiter reads only `authContext.id`.
- **`tests/support/rate-limit-harness.ts`** — Supplies `withReloadedRateLimits`, which re-imports the rate-limits module with overridden env vars so each test can set an arbitrary budget.
- **`tests/support/stub.ts`** — Supplies `asStub<AuthContext>`, which creates a minimal proxy object so the test only needs to set `.id`.

## Notes

- The handler is deliberately a 200 no-op; the test asserts limiter behavior, not route wiring. Route mounting is covered by `../unit/routes.test.ts`.
- `withReloadedRateLimits` uses a cached dynamic import, so `jest.resetModules()` in `afterEach` is required for each test to get a fresh module instance with the new env value.
- Budget is driven by the `NODE_CART_MERGE_RATE_LIMIT_MAX` environment variable, not a constructor argument.
- Only `AuthContext.id` is meaningful to the limiter; the rest of the context object is irrelevant here.
