---
source: src/modules/payments/tests/unit/rate-limits.test.ts
source_sha256: c4b0416256d98f864169e4aa8d24af66f59186e42949f448a41d35791c102bb9
context_sha256: a92034a3277d1a96b458a76340bcb053d83c6739e02417527d8ac846e83c0ee2
generated_at: 2026-11-22T07:05:58.017693+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/unit/rate-limits.test.ts

## Purpose
Unit tests that pin the relationships between the payments module's declared rate-limit budgets (from `src/modules/payments/rate-limits.ts`): relative sizes, shared windows, keying, and which requests spend each budget. It checks configuration only. The behavioural test, where a real request goes through `express-rate-limit` and `paymentDeclineChallengeGate` triggers after a prior decline, lives in `src/modules/payments/tests/integration/payment-velocity.test.ts`, because `no-restricted-imports` treats that middleware as an integration concern.

## Key elements
- `budget(namespace)` — local helper that looks up one of `paymentsRateLimits`' budgets by `namespace` via `budgetIn`.
- `paymentConfirmAttemptLimiter` / `paymentConfirmDeclineLimiter` tests:
  - `payments-confirm-declines` has a lower `defaultMax` than `payments-confirm-attempts`.
  - Both use the same `windowMs`, which is not `'shared'`.
  - `payments-confirm-declines` and `payments-confirm-attempts` differ in `skipSuccessfulRequests`: the declines budget sets it to `true`, the attempts budget does not.
  - `payments-confirm-declines-block`:
    - keyed by `KEYED_BY_ADDRESS_BLOCK` with `keyGenerator` `addressBlockOf`;
    - `defaultMax` above the per-account decline budget;
    - env var `NODE_PAYMENT_DECLINE_BLOCK_RATE_LIMIT_MAX`;
    - same window as the declines budget;
    - `skipSuccessfulRequests` is `true`;
    - its own `requestPropertyName`, different from the declines budget's.
- `paymentIntentLimiter` test: `payments-intent-sync` is keyed by `KEYED_BY_AUTHENTICATED_ACCOUNT`, with `defaultMax` 30, env var `NODE_PAYMENT_INTENT_RATE_LIMIT_MAX`, the same window as the attempts budget, and successes count against it.
- `webhookLimiter` test: `payment-webhook` is keyed by address block with `addressBlockOf`, skips successful requests, and has `audited` set to `false`.

## Relationships
- `src/modules/payments/rate-limits.ts` — the subject under test; `paymentsRateLimits` supplies every budget asserted on.
- `src/infrastructure/http/middlewares/rate-limit.ts` — supplies the `KEYED_BY_ADDRESS_BLOCK` and `KEYED_BY_AUTHENTICATED_ACCOUNT` constants and the `addressBlockOf` key generator that the tests compare against.
- `tests/support/rate-limit-budgets.ts` — supplies `budgetIn` (imported as `@tests/rate-limit-budgets`), which finds a budget by namespace.

## Notes
- Only the 30 default for `payments-intent-sync` is asserted as a literal. The other tests compare budgets to one another rather than to fixed numbers.
- The `payment-webhook` budget is not audited, because a forged flood would bury the audit trail in rate-limit rows. Instead the metric and the alert are left to carry that trail.
