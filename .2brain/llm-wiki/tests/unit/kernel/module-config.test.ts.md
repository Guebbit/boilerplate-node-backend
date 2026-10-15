---
source: tests/unit/kernel/module-config.test.ts
sha256: ebdcb8893fb5996ac78755afa45fc37f6cdba782901ebf8f1d8bca107a8e6644
generated_at: 2026-10-15T13:22:20.653630+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/module-config.test.ts

## Purpose

Unit tests for `assertModuleConfig` and `configSlicesOf` (the boot-time config gate). The file verifies the **collecting** contract: that all offending variables from multiple modules and app-tier slices are reported in a single refusal, that comma-separated key rings are validated member-by-member, and that rate-limit budgets become checkable slices. It deliberately does **not** test message wording (covered in `define.test.ts`) or app-owned variables like `NODE_URL` (covered in `app/config.test.ts`).

## Key elements

- **`configure()`** — Sets `NODE_ENV` to `'development'` so the presence/cross-field rules don't short-circuit (they are skipped under `test`).
- **`moduleRequiring(name, variable, minLength)`** — Factory returning an `AppModule` whose single slice declares one `secret` field; used as the standard fixture for presence tests.
- **`failing(name, message)`** — Factory returning an `AppModule` whose slice `check` always reports a fixed message; used to verify that module and caller checks are aggregated.
- **`describe('module-declared slices')`** — Placeholder detection, multi-offender collection, comma-separated ring member-by-member validation, trailing-comma tolerance, all-commas rejection, and `minLength: 0` semantics.
- **`describe('the environment that skips the presence rules')`** — Confirms `NODE_ENV=test` bypasses presence checks entirely.
- **`describe('appSlices — what a caller other than a module contributes')`** — Verifies caller-declared slices (e.g. `text` fields) and caller `check` results are folded into the same single refusal as module slices.
- **`describe('a module's rate-limit budgets')`** — Confirms `configSlicesOf` maps `rateLimits` to a `demo-rate-limits` slice, that the budget ceiling is validated even under `NODE_ENV=test`, and that a module with no budgets yields no slices.

## Relationships

- **`src/kernel/module-config.ts`** — The module under test; provides `assertModuleConfig` (the boot gate) and `configSlicesOf` (derives slices from a module, including rate-limit budgets).
- **`src/infrastructure/config/define.ts`** — `defineConfig` is used to construct realistic `slice` objects for the test fixtures.
- **`src/infrastructure/config/fields.ts`** — `secret` and `text` field constructors populate the `shape` of test slices.
- **`src/kernel/registry.ts`** — Supplies the `AppModule` type that every fixture conforms to.
- **`src/types/index.ts` / `src/types/rate-limit-budget.ts`** — `RateLimitBudget` type shapes the budget fixture in the rate-limit describe block.
- **`tests/support/environment.ts`** — `withoutEnvironmentInThisFile` isolates this file's env vars at the top level; `setEnvironment` sets/unsets variables per test case.

## Notes

- Every presence test calls `configure()` first. Omitting it makes the suite silently pass because the test-environment short-circuit skips all presence and cross-field validation.
- The comma-separated ring tests encode a specific product decision: trailing commas are treated as typos (ignored), but an all-commas value is still rejected. This is a behavioral contract, not an implementation detail.
- `withoutEnvironmentInThisFile` at the top of the file pins five variables (`NODE_ENV`, `SECRET`, `SECRET_TWO`, `CALLER_OWNED`, `BUDGET_MAX`) so that no test accidentally inherits a value from the surrounding CI environment.
- The file's docstring explicitly scopes itself: message formatting belongs to `define.test.ts`; app-level variable ownership belongs to `app/config.test.ts`. Adding assertions for those concerns here would break the separation.
