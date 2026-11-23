---
source: src/modules/cart/tests/integration/checkout-rate-limit.test.ts
source_sha256: 96a31133788e4bb7d112fa3d35b5dc724def0bfa98a39a6ee1bb9dccbd638c01
context_sha256: add26e48f4d8509e2bfa0e4160864b9d0f242051250c29e5a9f217121a8a7436
generated_at: 2026-11-22T04:38:31.757522+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/checkout-rate-limit.test.ts

## Purpose
Integration test for the per-account checkout budget on `POST /cart/checkout`. It exercises the limiter over real HTTP (supertest) against a trivial Express handler instead of a real checkout, since the property under test belongs to the limiter and a real checkout would only add a database round trip per attempt. `routes.test.ts` separately asserts that the real route mounts the limiter.

## Key elements
- `asAccount` — middleware standing in for `getAuth`; sets `request.authContext` to a stub `AuthContext` whose `id` is the `x-account` header (default `'anonymous'`).
- `attempt(app, account)` — sends one `POST /checkout` as `account` and resolves to the response status.
- `checkoutApp(limit, status)` — builds an Express app with `asAccount`, then `checkoutLimiter` from `@modules/cart/rate-limits` (loaded fresh with `NODE_CHECKOUT_RATE_LIMIT_MAX` set to `limit`), then a handler that replies with `status`.
- Test cases in `describe('the checkout budget')`:
  - With a limit of 3 and a 201 handler, five attempts by one account give `[201, 201, 201, 429, 429]`.
  - With a limit of 2 and a 409 handler, `[409, 409, 429]`: refused checkouts spend the budget just like placed ones, because they still read the basket and stock.
  - With a limit of 1, a second attempt by `'one'` gets 429 while `'two'` gets 201, so budgets are per account.

## Relationships
- `src/modules/cart/rate-limits.ts` — the module under test; its `checkoutLimiter` is imported dynamically, and its limit is read from `NODE_CHECKOUT_RATE_LIMIT_MAX`.
- `tests/support/rate-limit-harness.ts` — `withReloadedRateLimits` imports the module with the env override applied, so each app gets a fresh limiter.
- `tests/support/stub.ts` — `asStub` builds the partial `AuthContext` used in `asAccount`.
- `src/types/auth-context.ts` / `src/types/index.ts` — supply the `AuthContext` type, imported from `@types`.

## Notes
- `afterEach` calls `jest.resetModules()` so limiter state doesn't carry across tests; each test builds its own app and limiter.
- The limiter keys on the account id from the auth context, which is why the stub auth middleware must run before it.
