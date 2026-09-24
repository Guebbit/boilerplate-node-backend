---
source: tests/support/rate-limit-budgets.ts
sha256: 513dc4106b4fd7f9c8ab0655e1fc4c8e3d78170b8222988dd5a00e1af84597fd
generated_at: 2026-09-23T20:12:53.406410+00:00
model: ollama:qwen3.8:27b
---

# tests/support/rate-limit-budgets.ts

## Purpose

A small test-support helper that lets unit-test suites retrieve a named `RateLimitBudget` from a module's declared budget array. It exists so the three rate-limit relationship tests (account, feedback, payments) can reference budgets by `namespace` without repeating a find-and-check pattern, and so a missing budget fails loudly instead of propagating `undefined`.

## Key elements

- **`budgetIn(budgets, namespace)`** — The sole export. Takes a readonly array of `RateLimitBudget` and a `namespace` string, returns the matching budget, or throws an `Error` with a descriptive message naming the missing namespace.

## Relationships

- **`src/modules/account/tests/unit/rate-limits.test.ts`**, **`src/modules/feedback/tests/unit/rate-limits.test.ts`**, **`src/modules/payments/tests/unit/rate-limits.test.ts`** — Direct consumers. Each suite calls `budgetIn` to pull two budgets by name and assert a numeric relationship (ratio, ordering, etc.) between their limits.
- **`src/types/rate-limit-budget.ts`** — Defines the `RateLimitBudget` interface that `budgetIn` operates on.
- **`src/types/index.ts`** — Barrel re-export; the import path `@types` resolves through this file to reach `RateLimitBudget`.

## Notes

- The function is intentionally *not* generic over the budget array type; it accepts `readonly RateLimitBudget[]` and returns `RateLimitBudget`. If a module ever needs a budget shape that extends `RateLimitBudget`, the array will need to be typed as the base interface before passing it here.
- The thrown error message includes the offending `namespace` string in quotes, making test-failure output directly actionable.
- This file is test-support only (lives under `tests/`); it is not part of the shipped application.
