---
source: src/modules/example/rate-limits.ts
sha256: e26965a1b2bec0e7db3bca98c95a2aa89d26ff49144874547aed05ee9dc45151
generated_at: 2026-10-14T15:43:37.103246+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/rate-limits.ts

## Purpose

Declares the "example" module's rate-limit budgets as typed data and converts them into Express middleware via the shared `buildRateLimiter` helper. It is an optional, self-contained capability file: deleting it (and its route mount) removes rate limiting from the module entirely.

## Key elements

- **`CREATE_EXAMPLE_BUDGET`** — `RateLimitBudget` constant governing `POST /examples`. Limit: 30 per shared window (env override `NODE_EXAMPLE_RATE_LIMIT_MAX`). Keyed by authenticated account via `accountIdOf`. Audited; budget is spent only on successful creation.
- **`createExampleLimiter`** — `RequestHandler` produced by `buildRateLimiter(CREATE_EXAMPLE_BUDGET)`; mounted on the route to enforce the budget.
- **`exampleRateLimits`** — `readonly RateLimitBudget[]` listing every budget in this module; referenced by `module.ts`'s `rateLimits` field for manifest aggregation.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Source of `buildRateLimiter`, `accountIdOf`, and `KEYED_BY_AUTHENTICATED_ACCOUNT`. This file is purely declarative; the actual counting/keying logic lives there.
- **`src/modules/example/module.ts`** — Imports `exampleRateLimits` and lists it on the module manifest's `rateLimits` property.
- **`src/modules/example/routes.ts`** — Imports `createExampleLimiter` and mounts it as middleware on the `POST /examples` route.
- **`src/modules/example/tests/unit/manifest.test.ts`** — Exercises the module manifest, which in turn includes the budgets declared here.
- **`src/types/rate-limit-budget.ts` / `src/types/index.ts`** — Define the `RateLimitBudget` type that both the budget constant and the `exampleRateLimits` array conform to.

## Notes

- Keying is deliberately **per-account, not per-address**: the file's docstring explains that an address-keyed budget would let one noisy account starve other accounts behind the same address.
- The budget is consumed **only on success** (`bounds` field documents this), so malformed or rejected requests do not spend quota.
- `windowMs` is the string `'shared'`, not a number — resolution of that sentinel happens inside the infrastructure middleware.
- To add a second budget in this module, append it to `exampleRateLimits`; `module.ts` picks up the array wholesale, so no further registration is needed.
