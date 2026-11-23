---
source: src/modules/cart/tests/integration/merge-rate-limit.test.ts
source_sha256: c1fb6aae99f82bf2c57f192a25908cd413fa75c19485d8b489d676f8d142eb48
context_sha256: add26e48f4d8509e2bfa0e4160864b9d0f242051250c29e5a9f217121a8a7436
generated_at: 2026-11-22T04:40:27.657264+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/merge-rate-limit.test.ts

## Purpose
Integration test for the per-account rate limit on `POST /cart/merge`. A merge can mean up to a hundred catalogue reads and cart writes in one request, so it has its own per-account budget. The global per-address limiter would count it only once. The test mounts the limiter on a trivial handler, since the property belongs to the limiter. `src/modules/cart/tests/unit/routes.test.ts` asserts that the real route mounts it.

## Key elements
- `asAccount`: middleware standing in for `getAuth`. It sets `request.authContext` to a stub `AuthContext` whose `id` comes from the `x-account` header, or `'anonymous'` if the header is missing. Only `.id` is read.
- `mergeAppWithBudget(limit)`: loads `@modules/cart/rate-limits` through `withReloadedRateLimits` with `NODE_CART_MERGE_RATE_LIMIT_MAX` set to `limit`. It returns an Express app with `asAccount` and `mergeLimiter` guarding `POST /merge`, which answers `200 { success: true }`.
- Test "refuses with 429 once an account has spent it": with a budget of 2, three requests from the same account give statuses `[200, 200, 429]`.
- Test "budgets one account apart from another": with a budget of 1, account `one` is refused on its second request, while account `two` still gets `200`.
- `afterEach(() => jest.resetModules())` clears the module cache between tests.

## Relationships
- `src/modules/cart/rate-limits.ts`: the code under test. The test imports its `mergeLimiter` export dynamically and configures it through the `NODE_CART_MERGE_RATE_LIMIT_MAX` env var.
- `tests/support/rate-limit-harness.ts`: provides `withReloadedRateLimits`, which imports the limiter module with the env overrides applied.
- `tests/support/stub.ts`: provides `asStub`, used to build the partial `AuthContext`.
- `src/types/auth-context.ts` and `src/types/index.ts`: supply the `AuthContext` type, imported from `@types`.

## Notes
- `rateLimit()` reads its options only once, so each test needs a freshly loaded module to apply a new budget. This is why the module is reloaded through the harness and `jest.resetModules()` runs after each test.
- The first test's title says it refuses "whatever the requests answered". The test handler always returns 200, so the count does not depend on the response status.
- Limiting is keyed on the account id from `authContext`, not the client address.
