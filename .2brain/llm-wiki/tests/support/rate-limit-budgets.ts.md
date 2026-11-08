---
source: tests/support/rate-limit-budgets.ts
sha256: 6ee6451fca0321af2f0680b55345b1b9928cb9374a14ef79c8531cbbf91a96e3
generated_at: 2026-11-08T09:57:56.001401+00:00
model: ollama:qwen3.8:27b
---

# tests/support/rate-limit-budgets.ts

## Purpose

A small test-support utility for rate-limit unit suites. It provides a typed, fail-fast lookup so that tests can reference a specific budget by name and then assert the *relationship* between two budgets' numeric values, rather than indexing by position or re-declaring expected values inline.

## Key elements

- **`budgetIn(budgets, namespace)`** — Searches a `readonly RateLimitBudget[]` for the entry whose `namespace` matches the given string and returns it. Throws a descriptive `Error` (rather than returning `undefined`) when no match exists, making test failures self-explanatory.

## Relationships

- **`src/types/rate-limit-budget.ts` / `src/types/index.ts`** — Imports the `RateLimitBudget` type via the `@types` barrel; the function's signature and the `namespace` field it matches on are defined there.
- **`src/modules/account/tests/unit/rate-limits.test.ts`**, **`src/modules/payments/tests/unit/rate-limits.test.ts`**, **`src/modules/tasks/tests/unit/rate-limits.test.ts`** — The three consumer suites. Each calls `budgetIn` to grab two named budgets from its module's declared array and then asserts invariants between their numbers (e.g., one budget's limit is a multiple of the other's).

## Notes

- The file lives under `tests/support/`, not inside any module's `tests/` directory, so it is shared across modules and must remain module-agnostic.
- The throw-on-miss design is intentional: a missing budget name is a test-authoring bug, not a runtime edge case, so it should surface immediately with the offending name in the message.
