---
source: src/modules/payments/tests/unit/rate-limits.test.ts
sha256: c4b0416256d98f864169e4aa8d24af66f59186e42949f448a41d35791c102bb9
generated_at: 2026-11-14T21:21:52.926509+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/rate-limits.test.ts

## Purpose

Unit tests that pin the *declarative relationships* between the payments module's rate-limit budgets (attempts vs. declines, per-account vs. per-address-block, intent-sync pool, webhook limiter). They assert that the budget configuration encodes the intended invariants—relative strictness, shared windows, keying strategy—without sending any HTTP traffic.

## Key elements

- **`budget(namespace)`** — thin helper that calls `budgetIn(paymentsRateLimits, namespace)` to retrieve a single budget config by its namespace string.
- **`describe('paymentConfirmAttemptLimiter and paymentConfirmDeclineLimiter')`** — five assertions covering:
  - decline `defaultMax` < attempt `defaultMax`
  - both budgets share the same non-`'shared'` `windowMs`
  - the block-level decline budget is keyed by `addressBlockOf`, is looser, uses its own env var, and shares the window
  - block budget has `skipSuccessfulRequests: true` and a distinct `requestPropertyName`
  - decline budget skips successes; attempt budget does not
- **`describe('paymentIntentLimiter')`** — verifies the intent+sync pooled budget is account-keyed, fixed at 30, uses `NODE_PAYMENT_INTENT_RATE_LIMIT_MAX`, shares the attempt window, and does *not* skip successful requests.
- **`describe('webhookLimiter')`** — verifies the webhook budget is block-keyed, skips successes, and is explicitly non-audited (`audited: false`).

## Relationships

- **`src/modules/payments/rate-limits.ts`** — source of truth; exports `paymentsRateLimits`, the array of budget descriptors these tests inspect.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — supplies the constants and helpers (`KEYED_BY_ADDRESS_BLOCK`, `KEYED_BY_AUTHENTICATED_ACCOUNT`, `addressBlockOf`) that the tests compare against.
- **`tests/support/rate-limit-budgets.ts`** — provides `budgetIn`, the lookup utility that resolves a budget object from a namespace string within the array.

## Notes

- The file deliberately does **not** exercise `express-rate-limit` middleware; the header comment and `no-restricted-imports` rule direct behavioural (request-through-middleware) tests to `../integration/payment-velocity.test.ts`.
- Assertions are written as *relative* comparisons (less-than, equality of windows) rather than hard-coded absolute values, with the single exception of `defaultMax === 30` for the intent-sync pool.
- The webhook budget's `audited: false` is intentional (comment: "A forged flood would bury the audit trail in rate-limit rows"), not an oversight.
