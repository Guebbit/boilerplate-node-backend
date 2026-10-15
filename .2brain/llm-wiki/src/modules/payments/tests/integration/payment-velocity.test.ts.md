---
source: src/modules/payments/tests/integration/payment-velocity.test.ts
sha256: cda8cfda5447dc5db8d2f3fe0e3328e4e4628dd90ee501c21b91230f8d8796b5
generated_at: 2026-10-15T11:34:14.325485+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/payment-velocity.test.ts

## Purpose

Integration tests for the three velocity limiters and the anti-bot challenge gate that guard `POST /payments/:id/confirm`. They verify budget exhaustion, per-account isolation, correct outcome discrimination (decline vs. success vs. order-lost), and block-level (IP) budgeting — all against trivial Express stubs rather than the real payment route, keeping each assertion focused on limiter behaviour without a database round trip.

## Key elements

- **`asAccount(id)`** – Express middleware that attaches a stub `AuthContext` (only `.id` is set) to `request.authContext`, simulating a resolved auth step.
- **`declineAwareApp(declineLimiter)`** – Builds a minimal Express app whose `/confirm` route sets `request.paymentConfirmDeclined` based on the body's `outcome` field (`declined`, `order-lost`, `succeeded`) and returns the corresponding status (409/409/200).
- **`limitersWithBudget(attemptLimit, declineLimit?)`** – Uses `withReloadedRateLimits` to re-evaluate `@modules/payments/rate-limits` with specific `NODE_PAYMENT_CONFIRM_RATE_LIMIT_MAX` / `NODE_PAYMENT_DECLINE_RATE_LIMIT_MAX` env values, returning the fresh limiter instances.
- **`appWithBudget(declineLimit)`** – Similar re-evaluation helper, but also imports and chains `paymentDeclineChallengeGate` after the decline limiter; used by the challenge-gate tests.
- **`blockApp(accountLimit, blockLimit)`** – Chains all three limiters (`paymentConfirmDeclineLimiter`, `paymentConfirmDeclineBlockLimiter`, `paymentDeclineChallengeGate`) the same order as the real route, with a variable `x-account` header per request.
- **`describe` blocks** – Four groups: confirm-attempt budget, decline budget, decline challenge gate, and address-block decline budget. Each calls `jest.resetModules()` in `afterEach` to clear the re-evaluated module cache.

## Relationships

- **`src/modules/payments/rate-limits.ts`** – The module under test. Dynamically imported (after `jest.resetModules()`) to obtain fresh limiter instances (`paymentConfirmAttemptLimiter`, `paymentConfirmDeclineLimiter`, `paymentConfirmDeclineBlockLimiter`, `paymentDeclineChallengeGate`) configured via environment variables.
- **`src/types/auth-context.ts`** – Provides the `AuthContext` type used by `asAccount` to shape the stub `request.authContext` object (only `id` is read by the limiters' `accountIdOf` key function).
- **`src/types/index.ts`** – Barrel re-export of `AuthContext`; the import in this file resolves through this path.
- **`tests/support/environment.ts`** – `setEnvironment` is called to inject/override `NODE_ANTIBOT_PROVIDER`, `NODE_PAYMENT_DECLINE_RATE_LIMIT_MAX`, and `NODE_PAYMENT_DECLINE_BLOCK_RATE_LIMIT_MAX` before module re-evaluation.
- **`tests/support/rate-limit-harness.ts`** – `withReloadedRateLimits` wraps the `jest.resetModules()` + dynamic-import pattern so each test gets isolated limiter instances with a chosen budget.
- **`tests/support/stub.ts`** – `asStub` creates a minimal object literal typed as `AuthContext` for the `asAccount` helper.

## Notes

- The file intentionally does **not** mount the real `postPaymentConfirm` handler; the comment at the top notes that `payments/tests/unit/routes.test.ts` already asserts the real route chains the three limiters in the documented order.
- `rateLimit()` reads its options once at construction. Changing the budget therefore requires a full module re-evaluation (`jest.resetModules()` + fresh `import()`), which is why every helper that needs a different budget follows that recipe.
- The decline limiter keys on `request.paymentConfirmDeclined === true`. The test harness must set this field before the limiter's internal check; a `409` from an order-lost race does **not** set it, which is verified explicitly.
- The challenge gate reads the same property the decline limiter was configured with, so the gate and limiter must come from the **same** module instance (same `jest.resetModules()` cycle). `appWithBudget` and `blockApp` enforce this by importing both in one statement.
- The block-level tests use `supertest`'s single outbound IP, so all requests share one address block regardless of the `x-account` header value.
