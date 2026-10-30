---
source: tests/support/rate-limit-budgets.ts
sha256: 32ab6b2a94b6d7dd9c21dd75e9c3af571649e815fa4f430f1aa10552090104f6
generated_at: 2026-10-29T07:09:50.353472+00:00
model: ollama:qwen3.8:27b
---

# tests/support/rate-limit-budgets.ts

## Purpose

Test-support helper that retrieves a single `RateLimitBudget` from a module's budget array by its `namespace` string. It exists so the three rate-limit unit suites (account, payments, tickets) can pin the numeric relationship between two named budgets without repeating lookup-and-assert boilerplate.

## Key elements

- **`budgetIn(budgets, namespace)`** (exported function) — Finds the first entry in `budgets` whose `namespace` matches the given string and returns it. Throws `Error` with a descriptive message if no match is found, rather than returning `undefined`. This makes a wrong namespace name fail loudly in the test output instead of producing a silent `undefined` downstream.

## Relationships

- **`src/types/rate-limit-budget.ts`** — Defines the `RateLimitBudget` interface that `budgetIn` operates on (imported via `@types`).
- **`src/types/index.ts`** — Barrel re-export; the file imports the type through this alias.
- **`src/modules/account/tests/unit/rate-limits.test.ts`** — Primary consumer; calls `budgetIn` to select two named budgets and assert their numeric relationship.
- **`src/modules/payments/tests/unit/rate-limits.test.ts`** — Same usage pattern (the "payments twin").
- **`src/modules/tickets/tests/unit/rate-limits.test.ts`** — Same usage pattern (the "tickets twin").

## Notes

- The function is deliberately *infallible-by-convention*: it never returns `undefined`. If you need a soft lookup (e.g., "assert budget X is absent"), use `budgets.find(...)` directly instead.
- `budgets` is typed `readonly RateLimitBudget[]`, so callers pass frozen/tuple-allocated arrays without casting.
