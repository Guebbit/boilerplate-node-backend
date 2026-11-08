---
source: tests/cross-cutting/rate-limit-budgets.test.ts
sha256: 8c0fd5d818e4693e0cf87b01e957ff29449683d868b2f44fdf25dfa6bb6ae96f
generated_at: 2026-11-08T09:30:34.099784+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/rate-limit-budgets.test.ts

## Purpose

Validates that every rate-limit budget in the application (module-owned and infrastructure-owned) is internally consistent as a set: unique names, unique environment variables, unique Redis namespaces, exclusive ownership between modules and infrastructure, and a controlled list of budgets that fail open during a store outage.

## Key elements

- **`moduleBudgets`** — Flat-maps `enabledModules` to collect every module-declared budget, tagging each with its owning module name.
- **`allBudgets`** — Concatenates `moduleBudgets` with `INFRASTRUCTURE_RATE_LIMITS` (tagged `owner: 'infrastructure'`), producing the full set under test.
- **`duplicatesOf(field)`** — Returns the list of values appearing more than once for the given field (`name`, `namespace`, or `environmentVariable`) across `allBudgets`.
- **Test suite** (`describe('rate-limit budgets, as a set')`) — Five assertions: unique names, unique env vars, unique namespaces, only the `global` namespace uses `onStoreError: 'pass'`, and no env var is declared in both a module and `INFRASTRUCTURE_RATE_LIMITS`.

## Relationships

- **`src/modules.ts`** — Imports `enabledModules`; the test iterates only over modules that are currently enabled, so a disabled module's budgets are invisible to these checks.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Imports `INFRASTRUCTURE_RATE_LIMITS`; the test treats this array as the single source of infrastructure-owned budgets and asserts no overlap with module budgets.
- **`src/types/index.ts`** / **`src/types/rate-limit-budget.ts`** — Provides the `RateLimitBudget` type used to shape `moduleBudgets` and `allBudgets` and to define the fields (`name`, `namespace`, `environmentVariable`, `onStoreError`) the assertions inspect.

## Notes

- The ownership-exclusivity check compares by `environmentVariable` (not by `name` or `namespace`), so a module *could* in theory reuse an infrastructure budget's name and still pass the other tests but would be caught here.
- The "fail-open" test hard-codes `['global']` as the expected pass-through namespace; adding a new `onStoreError: 'pass'` budget elsewhere will break this test intentionally.
- Because `enabledModules` is used (not a static list), the test set shrinks/grows as modules are toggled on/off — a budget on a disabled module is not checked.
