---
source: tests/cross-cutting/rate-limit-budgets.test.ts
sha256: 584ffdd8e1ea76113ad04f4ec24ac2e6463d4c808423fb461830f66a6f6c6519
generated_at: 2026-09-23T19:59:03.067133+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/rate-limit-budgets.test.ts

## Purpose

Cross-cutting integrity test that treats every rate-limit budget in the app (module-owned and infrastructure-owned) as a single set and asserts no field collides, no budget is declared in two places, and every non-exempt budget's env var is raised in both test-setup surfaces. It exists so that adding a budget to one module silently passing while duplicating or missing a raise-site is caught immediately.

## Key elements

- **`moduleBudgets`** — flattens `enabledModules` to collect all module-declared budgets, each tagged with its owning module name.
- **`allBudgets`** — concatenates `moduleBudgets` with `INFRASTRUCTURE_RATE_LIMITS` (tagged `'infrastructure'`), forming the complete set under test.
- **`duplicatesOf(field)`** — generic helper that returns the set of values appearing more than once for a given budget field (`name`, `namespace`, `environmentVariable`).
- **`raisedInSetup()`** — reads `tests/support/setup.ts` as raw text and regex-extracts every `process.env.NODE_...` assignment target, returning them as a `Set<string>`.
- **`describe` block (7 tests)** — asserts unique names, unique env vars, unique Redis namespaces, single ownership (module vs. infrastructure), raise in `setup.ts`, non-blank `testExemption` when present, and raise in `scenarios/rate-limits.ts`.

## Relationships

- **`src/modules.ts`** — source of `enabledModules`, which is the discovery mechanism for all module-declared budgets.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — source of `INFRASTRUCTURE_RATE_LIMITS`, the infrastructure-owned budgets checked for duplicates and cross-declaration.
- **`scenarios/rate-limits.ts`** — source of `RAISED_RATE_LIMIT_ENV_VARS`; a second raise-site that must also cover every non-exempt budget (used by scripted drivers like `apply.ts`).
- **`src/types/rate-limit-budget.ts`** (via `src/types/index.ts`) — defines the `RateLimitBudget` type, including the `testExemption` field that gates the raise-in-setup checks.

## Notes

- `raisedInSetup()` deliberately reads `setup.ts` as a file via `readFileSync` + regex rather than importing it, to avoid triggering side effects (i18next init, locale registration) for what is purely a static-text check.
- Two independent raise-sites are tested (`tests/support/setup.ts` and `scenarios/rate-limits.ts`) because they serve different consumers — the Jest suite and the scripted driver respectively — and completeness in one does not imply completeness in the other.
- `testExemption` is a per-budget field (not a separate list); the "exempts with a reason" test enforces that it must be a non-empty string when present, making the exemption an explicit, documented decision on the budget itself.
