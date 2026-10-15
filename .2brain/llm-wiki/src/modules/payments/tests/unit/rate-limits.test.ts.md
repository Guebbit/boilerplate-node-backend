---
source: src/modules/payments/tests/unit/rate-limits.test.ts
sha256: 50c7ff1c0fbe868032acccb266fac5e33b96b27435a7f6b51d1d409646bca95d
generated_at: 2026-10-15T11:38:46.750961+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/rate-limits.test.ts

## Purpose

Unit tests that pin the **relational invariants** among the payment confirm-attempt, confirm-decline, and intent-sync rate-limit budgets: relative strictness, shared window alignment, keying strategy, and which budgets skip successful requests. It deliberately avoids executing a real request through `express-rate-limit` (that belongs in the integration test `../integration/payment-velocity.test.ts`), so the assertions target the configuration objects directly.

## Key elements

- **`budget(namespace)`** — local helper wrapping `budgetIn(paymentsRateLimits, namespace)` to fetch one declared budget by its `namespace` key.
- **`describe('paymentConfirmAttemptLimiter and paymentConfirmDeclineLimiter')`** — asserts the structural contract:
  - Decline `defaultMax` < attempt `defaultMax` (rarer outcome, tighter bound).
  - Both use the same `windowMs`, and that window is *not* the shared browsing window.
  - The block-keyed variant (`payments-confirm-declines-block`) uses `KEYED_BY_ADDRESS_BLOCK` / `addressBlockOf`, has a looser `defaultMax` than the account-keyed variant, and reads its override from `NODE_PAYMENT_DECLINE_BLOCK_RATE_LIMIT_MAX`.
  - Block budget spends only on genuine declines (`skipSuccessfulRequests: true`) and uses a distinct `requestPropertyName`.
  - Decline budget skips successes; attempt budget does not.
- **`describe('paymentIntentLimiter')`** — asserts the pooled `payments-intent-sync` budget is keyed by authenticated account, capped at 30/hr, overridable via `NODE_PAYMENT_INTENT_RATE_LIMIT_MAX`, shares the attempt/decline window, and counts every request (no skip-on-success).

## Relationships

- **`src/modules/payments/rate-limits.ts`** — the system under test; provides the `paymentsRateLimits` configuration object whose budgets are asserted here.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — supplies the constants (`KEYED_BY_ADDRESS_BLOCK`, `KEYED_BY_AUTHENTICATED_ACCOUNT`) and the `addressBlockOf` key-generator function that the tests verify are wired to the correct budget.
- **`tests/support/rate-limit-budgets.ts`** — provides the `budgetIn` helper that extracts a single budget record from a rate-limits config by namespace, keeping this test free of manual property drilling.

## Notes

- Tests are **configuration-level**, not behavioural: no HTTP request is issued. The file's doc comment explicitly calls out the `no-restricted-imports` / integration-test split.
- Most assertions are *relational* (A < B, A === B, A ≠ B) rather than absolute, so refactoring one budget's number still passes as long as the invariants hold. The one absolute value (`toBe(30)`) is the intent-sync cap.
- The helper `budget()` is module-local and not exported; it exists solely to shorten repeated `budgetIn(paymentsRateLimits, …)` calls.
