---
source: src/modules/example/rate-limits.ts
sha256: 8d5d57054c43b946119611f5a1f91ed632bba541f7fca4d6df7dbb18a1f86e31
generated_at: 2026-11-08T05:51:55.538918+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/rate-limits.ts

## Purpose

Declares this module's rate-limit budgets as data and turns them into Express middleware via the shared `buildRateLimiter` helper. Each budget defines *what* is limited (a route's write action), *how* it is keyed (account vs. address), and *how much* is allowed (pulled from the generated file). Delete this file if the module no longer needs any budget.

## Key elements

- **`CREATE_EXAMPLE_BUDGET`** — A `RateLimitBudget` for `POST /examples`. Spreads the numeric limits from `exampleRateLimitData.exampleCreate` (in `./rate-limits.generated`), keys by authenticated account (`accountIdOf` + `KEYED_BY_AUTHENTICATED_ACCOUNT`), and spends on successful writes.
- **`createExampleLimiter`** (export) — The `RequestHandler` produced by `buildRateLimiter(CREATE_EXAMPLE_BUDGET)`. Mounted on the `POST /examples` route.
- **`exampleRateLimits`** (export) — `readonly RateLimitBudget[]` containing all budgets declared by this module. Referenced by `./module.ts`'s `rateLimits` field.

## Relationships

- **`@infrastructure/http/middlewares/rate-limit`** — Source of `buildRateLimiter`, `accountIdOf`, and `KEYED_BY_AUTHENTICATED_ACCOUNT`. The only middleware factory every module is expected to use.
- **`./module.ts`** — Consumes `exampleRateLimits` and lists it under its `rateLimits` property (the module manifest).
- **`./routes.ts`** — Mounts `createExampleLimiter` on the `POST /examples` endpoint.
- **`src/types/rate-limit-budget.ts` / `src/types/index.ts`** — Define the `RateLimitBudget` interface used for typing the budget objects.
- **`tests/unit/manifest.test.ts`** — Validates that `exampleRateLimits` is consistent with the module manifest.

## Notes

- **Account-keyed, not address-keyed.** The route requires sign-in; keying on the wallet address would let one noisy account exhaust the budget for every other account behind that address.
- **Numeric limits come from `./rate-limits.generated`** — a generated file not listed in the dependency graph. Regenerate it (via the tooling in `docs/tools/security.md#the-rate-limit-budgets`) before changing limits; do not hard-code numbers here.
- **One file per module.** The convention is one `rate-limits.ts` per feature module; adding a budget for a *different* module does not belong here.
