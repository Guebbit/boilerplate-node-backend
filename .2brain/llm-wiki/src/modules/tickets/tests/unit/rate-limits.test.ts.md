---
source: src/modules/tickets/tests/unit/rate-limits.test.ts
sha256: 602f00c19453eef3eb023724df0f98fb232a49de9cc05f46f26da62d8caaa7e5
generated_at: 2026-10-29T06:09:05.473760+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/unit/rate-limits.test.ts

## Purpose

Unit test that pins the **numeric invariants** between the ticket-module rate-limit budgets: contact-form budgets must stay a small fraction of the global browsing budget, and a block-scoped budget must sit above the address-scoped budget it widens. It does **not** exercise the middleware behaviorally.

## Key elements

- **`budget(namespace)`** — local helper that calls `budgetIn(ticketsRateLimits, namespace)` to retrieve a single declared budget by its `namespace` string.
- **`describe('contactLimiters')`** — the sole test block, containing two assertions:
  - `submissions` and `submission-identity` budgets are each **less than** `DEFAULT_RATE_LIMIT_MAX / 5`.
  - `submission-block` budget is **greater than** the `submissions` budget.

## Relationships

- **`src/modules/tickets/rate-limits.ts`** — the unit under test; supplies the `ticketsRateLimits` object whose per-namespace `defaultMax` values are asserted.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — provides `DEFAULT_RATE_LIMIT_MAX`, the global browsing ceiling used as the reference denominator.
- **`tests/support/rate-limit-budgets.ts`** — provides `budgetIn`, the test-support helper that looks up a budget entry by namespace key.

## Notes

- The file header explicitly defers **behavioral** tests (sending a real request through `express-rate-limit`) to `../integration/contact-identity-rate-limit.test.ts` and `../integration/submission-rate-limit.test.ts`. This unit file only checks that the *numbers* are ordered sensibly.
- The "small fraction" threshold is hardcoded as `/ 5`; there is no shared constant for the ratio.
- No test verifies an upper bound on `submission-block`—only that it exceeds `submissions`.
