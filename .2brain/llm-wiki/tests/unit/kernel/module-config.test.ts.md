---
source: tests/unit/kernel/module-config.test.ts
sha256: ebdcb8893fb5996ac78755afa45fc37f6cdba782901ebf8f1d8bca107a8e6644
generated_at: 2026-11-08T10:27:24.791351+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/module-config.test.ts

## Purpose

Unit tests for the boot-gate functions `assertModuleConfig` and `configSlicesOf` (from `@kernel/module-config`). Verifies that a misconfigured deployment is refused at startup with a single message naming every offender, rather than failing at runtime. Scope is the *collecting* behaviour—what a module and the app tier each contribute to one refusal. Message wording and `assertConfigIn` internals are covered in `tests/unit/infrastructure/config/define.test.ts`; app-tier-owned variables are asserted in `tests/unit/app/config.test.ts`.

## Key elements

- **`configure()`** — sets `NODE_ENV` to `'development'`, disabling the test-environment short-circuit so presence and cross-field rules actually execute.
- **`moduleRequiring(name, variable, minLength)`** — factory returning a minimal `AppModule` whose sole slice declares one `secret` field; used to exercise single-variable and multi-variable cases.
- **`failing(name, message)`** — factory returning a module whose slice `check` returns a fixed message; used to verify that caller-declared checks run alongside module checks in the same throw.
- **`describe('module-declared slices')`** — placeholder detection, multi-offender single throw, comma-separated ring validation (member-by-member, trailing-comma tolerance, all-comma refusal), and `minLength: 0` semantics (unset is fine, placeholder is not).
- **`describe('the environment that skips the presence rules')`** — confirms `NODE_ENV=test` short-circuits all presence checks.
- **`describe('appSlices')`** — verifies caller-declared slices (second argument to `assertModuleConfig`) are folded into the same refusal and that their `check` functions execute.
- **`describe('a module's rate-limit budgets')`** — confirms `configSlicesOf` converts a `RateLimitBudget` into a named slice (`'demo-rate-limits'`), that a non-integer ceiling is refused even under `NODE_ENV=test`, and that a module with no budgets yields an empty array.

## Relationships

- **`src/kernel/module-config.ts`** — system under test; exports `assertModuleConfig` and `configSlicesOf`.
- **`src/infrastructure/config/define.ts`** — `defineConfig` is called to build the `.slice` objects that form the test fixtures.
- **`src/infrastructure/config/fields.ts`** — `secret` and `text` constructors populate the `shape` objects inside those fixtures.
- **`src/kernel/registry.ts`** — provides the `AppModule` type used by the factory helpers and the budget test.
- **`src/types/rate-limit-budget.ts`** (via `@types`) — `RateLimitBudget` type for the budget fixture.
- **`tests/support/environment.ts`** — `withoutEnvironmentInThisFile` isolates the five env vars at file scope; `setEnvironment` is the per-test mutation helper.

## Notes

- **Every presence/cross-field case must call `configure()` first.** Under `NODE_ENV=test` those rules are short-circuited, so a test that forgets the call asserts nothing.
- **Trailing comma in a ring is a typo, not an empty member.** `'a-real-secret-value,'` passes; `',,'` fails. The split logic strips trailing empty entries but refuses a value that is *only* delimiters.
- **Budget ceiling validation is the one check that fires under `NODE_ENV=test`.** Presence rules are skipped, but a non-integer `BUDGET_MAX` still throws—deliberately, so a broken ceiling is caught in CI too.
- **`withoutEnvironmentInThisFile`** is a file-scoped guard (not a per-test `beforeEach`), ensuring no outer test leaks `SECRET`, `SECRET_TWO`, `CALLER_OWNED`, `BUDGET_MAX`, or `NODE_ENV` into these cases.
