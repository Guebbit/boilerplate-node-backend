---
source: src/modules/example/rate-limits.ts
sha256: 8d5d57054c43b946119611f5a1f91ed632bba541f7fca4d6df7dbb18a1f86e31
generated_at: 2026-10-29T03:54:08.557435+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/rate-limits.ts

## Purpose

Declares the rate-limit budgets for the example module and turns them into Express middleware. Each budget defines how many times an authenticated account may invoke a given endpoint within a window; the actual numeric limits live in the generated file, and the middleware wiring is shared infrastructure.

## Key elements

- **`CREATE_EXAMPLE_BUDGET`** (internal) — The budget object for `POST /examples`. Combines the numeric values from `exampleRateLimitData.exampleCreate` with `keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT` and `keyGenerator: accountIdOf`, so the budget is tracked per account rather than per address.
- **`createExampleLimiter`** (export, `RequestHandler`) — The ready-to-mount Express middleware produced by `buildRateLimiter(CREATE_EXAMPLE_BUDGET)`. Applied to the create route.
- **`exampleRateLimits`** (export, `readonly RateLimitBudget[]`) — The module's full list of budgets. Re-exported into `module.ts`'s `rateLimits` field for manifest/tooling consumption.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Provides `buildRateLimiter`, `accountIdOf`, and `KEYED_BY_AUTHENTICATED_ACCOUNT`. This file is the sole consumer pattern for turning a `RateLimitBudget` into middleware.
- **`src/modules/example/rate-limits.generated.ts`** — Supplies `exampleRateLimitData` (the numeric window/limit values). Regenerated; never hand-edited.
- **`src/modules/example/module.ts`** — Imports `exampleRateLimits` and lists it under its `rateLimits` field.
- **`src/modules/example/routes.ts`** — Applies `createExampleLimiter` as middleware on the `POST /examples` handler.
- **`src/types/rate-limit-budget.ts` / `src/types/index.ts`** — Define the `RateLimitBudget` type used throughout.
- **`src/modules/example/tests/unit/manifest.test.ts`** — Asserts that the budgets declared here match what the manifest expects.

## Notes

- Budgets are **keyed by authenticated account, not address**. A single account behind a shared address must not starve other accounts; the comment in the source makes this the deliberate choice.
- The numeric values (window length, max requests) live in `rate-limits.generated.ts`. To change a limit, change the source of generation—do not edit the generated file or hardcode numbers here.
- To remove rate-limiting from this module, delete this file, the corresponding mount in `routes.ts`, and the `rateLimits` entry in `module.ts`.
