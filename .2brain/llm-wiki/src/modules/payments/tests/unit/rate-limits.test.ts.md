---
source: src/modules/payments/tests/unit/rate-limits.test.ts
sha256: 50c7ff1c0fbe868032acccb266fac5e33b96b27435a7f6b51d1d409646bca95d
generated_at: 2026-11-08T07:40:26.846379+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/rate-limits.test.ts

## Purpose

Unit tests that assert the *structural invariants* of the payment rate-limit budget declarations in `paymentsRateLimits` — specifically the relative magnitudes, shared windows, keying strategy, and skip-successful behavior of the confirm-attempt, confirm-decline, decline-block, and intent-sync budgets. It exists to pin the *relationships between* those numbers (decline < attempt, block > account, shared hourly window) so refactors that silently break the intended tiering are caught.

## Key elements

- **`budget(namespace)`** — local helper that resolves a namespace string to a budget entry via `budgetIn(paymentsRateLimits, namespace)`. All assertions go through this.
- **`describe('paymentConfirmAttemptLimiter and paymentConfirmDeclineLimiter')`** — five tests covering:
  - decline `defaultMax` < attempt `defaultMax`
  - both budgets use the same explicit `windowMs` (not `'shared'`)
  - `payments-confirm-declines-block` is keyed by address block, has a looser cap, and shares the account window
  - block budget spends only on genuine declines under its own `requestPropertyName`
  - decline budget has `skipSuccessfulRequests: true` while attempt does not
- **`describe('paymentIntentLimiter')`** — one test asserting the intent+sync pool is per-account, max 30, env-var overridable, shares the attempt window, and counts every request (no skip-on-success).

## Relationships

- **`src/modules/payments/rate-limits.ts`** — provides `paymentsRateLimits`, the object under test. This file never mutates it; it only reads declared fields.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — exports the constants `KEYED_BY_ADDRESS_BLOCK`, `KEYED_BY_AUTHENTICATED_ACCOUNT`, and the `addressBlockOf` key-generator that the tests assert are wired into the budget declarations.
- **`tests/support/rate-limit-budgets.ts`** — provides `budgetIn`, the lookup utility that the local `budget()` helper delegates to.

## Notes

- These are **configuration-assertion tests only**. The file header explicitly defers behavioral testing (actually routing a request through `express-rate-limit` to trigger `paymentDeclineChallengeGate`) to `../integration/payment-velocity.test.ts`, because `no-restricted-imports` classifies that middleware as an integration-level dependency.
- `budgetIn` is the canonical way to address a budget by `namespace` across the test suite; prefer it over indexing the array manually.
