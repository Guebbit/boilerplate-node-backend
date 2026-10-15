---
source: tests/cross-cutting/rate-limit-budgets.test.ts
sha256: bae71ca22a5e289e4345192d99c837a44848f1bc4d6a82478b11b6c277ed7a7d
generated_at: 2026-10-15T12:39:53.948902+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/rate-limit-budgets.test.ts

## Purpose

Cross-cutting invariant test that treats **all** rate-limit budgets in the app (module-declared + infrastructure-owned) as a single set and asserts structural uniqueness and coverage: no two budgets share a `name`, `environmentVariable`, or `namespace`; no budget is declared in both a module and infrastructure; and every budget without a `testExemption` is raised in both `setup-environment.ts` and `scenarios/rate-limits.ts`. It also pins the single allowed `onStoreError: 'pass'` budget. The goal is to make any silent collision or omission loud at test time.

## Key elements

- **`moduleBudgets`** — `enabledModules.flatMap(…)` producing every module-declared budget tagged with its owning module name.
- **`allBudgets`** — `moduleBudgets` concatenated with `INFRASTRUCTURE_RATE_LIMITS` (tagged `owner: 'infrastructure'`). The single list every assertion operates on.
- **`duplicatesOf(field)`** — Returns an array of values that appear more than once for a given field (`name`, `namespace`, or `environmentVariable`) across `allBudgets`. Empty array = no collision.
- **`raisedInSetup()`** — Reads `tests/support/setup-environment.ts` **as raw text** (`readFileSync`) and regex-extracts every `process.env.NODE_*` variable that gets a `??=` assignment. Returns a `Set<string>`.
- **`describe('rate-limit budgets, as a set')`** — Eight assertions covering the invariants listed in the file's doc comment (uniqueness × 3, single pass-through budget, single ownership, setup-environment coverage, non-blank `testExemption`, scenario coverage).

## Relationships

- **`src/modules.ts`** — Provides `enabledModules`, the registry of app modules whose `.rateLimits` arrays are the source of module-owned budgets.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Exports `INFRASTRUCTURE_RATE_LIMITS`, the infrastructure-owned budget list merged into `allBudgets`.
- **`scenarios/rate-limits.ts`** — Exports `RAISED_RATE_LIMIT_ENV_VARS`, the set of env vars raised by the scripted driver; this test asserts it covers every non-exempt budget.
- **`src/types/rate-limit-budget.ts`** — Defines the `RateLimitBudget` interface (including the `testExemption` field whose semantics are documented on the type, not here).
- **`src/types/index.ts`** — Barrel re-export of `RateLimitBudget` used by the `@types` import in this file.

## Notes

- `raisedInSetup()` deliberately **reads the file as text** rather than importing `setup-environment.ts`, because importing it would execute the `??=` assignments a second time in the worker process. The test only needs the literal variable names.
- The regex in `raisedInSetup` matches only `NODE_`-prefixed env vars; a budget whose env var does not follow that convention would pass the "raised in setup" check silently.
- The `onStoreError` assertion hard-codes the expected pass-through set to `['global']`. Adding a new budget with `onStoreError: 'pass'` requires updating this literal — it is an explicit allow-list, not a computed invariant.
- `testExemption` is a **string reason** recorded on the budget itself (see the type); this test enforces that it is non-empty when present, but the *reason* is free-form.
- The scenario-coverage test is separate from the setup-environment test because `scenarios/rate-limits.ts` is consumed by driver scripts (`apply.ts`, `run-server.ts`) independently of the test runner's env setup.
