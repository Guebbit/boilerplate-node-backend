---
source: src/modules/payments/tests/unit/rate-limits.test.ts
sha256: bb6c9c25b7335d620262b8947afc480ca17e558704b8b642e3a1b12f1c245584
generated_at: 2026-09-23T19:24:36.997652+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/rate-limits.test.ts

## Purpose

Unit test that pins the *structural invariants* of the confirm-attempt and confirm-decline rate-limit budgets: their relative strictness, shared window, and skip-successful semantics. It validates configuration shape only—no HTTP requests are made—leaving behavioural verification to the integration suite.

## Key elements

- **`budget(namespace)`** — thin wrapper around `budgetIn(paymentsRateLimits, namespace)` that resolves a single budget object by its declared `namespace` key.
- **`describe('paymentConfirmAttemptLimiter and paymentConfirmDeclineLimiter')`** — three assertions:
  - Decline `defaultMax` < attempt `defaultMax` (decline is rarer/costlier).
  - Both budgets share the same `windowMs` value and that value is *not* the string `'shared'` (i.e., windowed to the intent→confirm hour, not the general browsing window).
  - Decline budget sets `skipSuccessfulRequests: true`; attempt budget does not.

## Relationships

- **`src/modules/payments/rate-limits.ts`** — source of the `paymentsRateLimits` config object under test. The test reads its declared budget entries but never exercises the limiters.
- **`tests/support/rate-limit-budgets.ts`** — provides `budgetIn`, the generic helper that extracts a budget definition from a rate-limit config array by `namespace`.

## Notes

- The file's header comment makes explicit that *behavioural* testing (a real request through `express-rate-limit` middleware, e.g. the `paymentDeclineChallengeGate` trigger) is deliberately excluded here because `no-restricted-imports` classifies that path as integration. That coverage lives in `../integration/payment-velocity.test.ts`.
- The window assertion checks that `windowMs` is *not* the literal string `'shared'`—a guard against someone wiring these budgets back to the global browsing window by mistake.
