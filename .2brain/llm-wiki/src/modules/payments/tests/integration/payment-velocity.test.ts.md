---
source: src/modules/payments/tests/integration/payment-velocity.test.ts
source_sha256: f157d78973c852ef3884e75072ddf10b40f824491f705eaf11e766e4fb7da430
context_sha256: 0c76eaaafb41ee50509d8c9c188dcf0b7ac24642524fd9dc63b3ba5a0260aae3
generated_at: 2026-11-22T06:58:06.757173+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/payment-velocity.test.ts

## Purpose
Integration tests for the card-testing velocity budgets on `POST /payments/:id/confirm`: the attempt limiter, the decline limiter, the address-block decline limiter, and the challenge gate between them. The tests use small stub Express handlers instead of the real `postPaymentConfirm` controller, because the behavior under test belongs to the limiters. A real payment would add a database round trip to every attempt. A comment in the file says `src/modules/payments/tests/unit/routes.test.ts` already checks that the real route mounts all three in the documented order.

## Key elements
- `asAccount(id)`: middleware that sets `request.authContext` to a stub `AuthContext` containing only `id`, standing in for `getAuth`.
- `declineAwareApp(declineLimiter)`: Express app with one `/confirm` route. The request body's `outcome` (default `declined`) sets `request.paymentConfirmDeclined`. A decline returns 409 `PAYMENT_DECLINED`. `order-lost` returns 409 `PAYMENT_ORDER_NOT_PAYABLE`. Any other outcome returns 200.
- `limitersWithBudget(attemptLimit, declineLimit = attemptLimit)`: uses `withReloadedRateLimits` to re-import `@modules/payments/rate-limits` with `NODE_PAYMENT_CONFIRM_RATE_LIMIT_MAX` and `NODE_PAYMENT_DECLINE_RATE_LIMIT_MAX` set.
- `appWithBudget(declineLimit)`: sets the decline env var, resets modules, and builds a route chained as `paymentConfirmDeclineLimiter`, then `paymentDeclineChallengeGate`, then a handler that always declines.
- `blockApp(accountLimit, blockLimit)`: builds the full chain of `paymentConfirmDeclineLimiter`, `paymentConfirmDeclineBlockLimiter`, `paymentDeclineChallengeGate` and a handler. The account comes from the `x-account` header. It also sets `NODE_PAYMENT_DECLINE_BLOCK_RATE_LIMIT_MAX`.
- Test suites:
  - **Confirm-attempt budget:** every outcome, including success, spends the budget, so attempts 4 and 5 of a 3-attempt budget return 429. Budgets are tracked per account.
  - **Decline budget:** only a genuine decline spends it. A lost-order 409 or a success does not.
  - **`paymentDeclineChallengeGate`:**
    - It never engages when `NODE_ANTIBOT_PROVIDER` is unset.
    - With `turnstile` selected, the first attempt passes through to the handler's own 409.
    - The next attempt, once the account has a decline on record, returns 403 `ANTIBOT_VERIFICATION_FAILED`.
  - **Address-block decline budget:** declines spread across many accounts exhaust a shared block budget and then return 429. Successes and order-lost 409s do not spend it. A further test about challenging a first-time account at half the block budget is cut off in the visible content.

## Relationships
- `src/modules/payments/rate-limits.ts`: the module under test. It supplies `paymentConfirmAttemptLimiter`, `paymentConfirmDeclineLimiter`, `paymentConfirmDeclineBlockLimiter` and `paymentDeclineChallengeGate`. It is dynamically imported after module reset.
- `tests/support/rate-limit-harness.ts`: provides `withReloadedRateLimits`, used by `limitersWithBudget`.
- `tests/support/environment.ts`: provides `setEnvironment`, which sets `NODE_*` env vars such as the budgets and `NODE_ANTIBOT_PROVIDER`.
- `tests/support/stub.ts`: provides `asStub`, used to build the partial `AuthContext`.
- `src/types/auth-context.ts` and `src/types/index.ts`: `AuthContext` is imported as a type from `@types`.

## Notes
- `rateLimit()` reads its options once, at construction. Every budget change therefore needs a module reset and a fresh import. Each `describe` block resets modules in `afterEach`.
- The decline limiter and the challenge gate must come from the same module instance, because the gate reads the property name the decline limiter was configured with.
- All requests come from `supertest`'s single address, so they share one address block. Only the account varies, through the `x-account` header.
- The comments describe the same module-reload approach as `auth-hardening.test.ts#limitersWithBudget`.
