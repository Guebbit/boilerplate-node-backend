---
source: src/modules/example/rate-limits.ts
source_sha256: e7fa5f96903caf3c06f5174ab3c7f363ebf9ce6eba84a3cd5380b93e776cdb27
context_sha256: 42d159c330ac0ee73ac8a6b84f4bb5f79b129e87189d7a4845c421e8b5e7855d
generated_at: 2026-11-22T05:10:34.568126+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/rate-limits.ts

## Purpose
Declares the example module's rate-limit budgets as data and turns them into Express middleware. It defines one budget, for creating examples, keyed per authenticated account, and exposes both the middleware and the budget list. The module is a template: its header says to delete this file (and the route mount) if a module needs no budget.

## Key elements
- `CREATE_EXAMPLE_BUDGET` (private): a `RateLimitBudget` that spreads `exampleRateLimitData.exampleCreate` from `./rate-limits.generated`. It adds `keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT` and `keyGenerator: accountIdOf`. Limits are per account, not per address, so one noisy account can't starve others behind the same address. A successful create spends the budget.
- `createExampleLimiter`: a `RequestHandler` built with `buildRateLimiter(CREATE_EXAMPLE_BUDGET)`. It is the limiter for `POST /examples`.
- `exampleRateLimits`: a `readonly RateLimitBudget[]` containing the module's budgets. `module.ts` lists it as `rateLimits`.

## Relationships
- `src/infrastructure/http/middlewares/rate-limit.ts`: supplies `buildRateLimiter`, `accountIdOf` and `KEYED_BY_AUTHENTICATED_ACCOUNT`. This is the single limiter builder every module uses.
- `src/types/rate-limit-budget.ts` (also exported through `src/types/index.ts`, imported here as `@types`): defines the `RateLimitBudget` type.
- `src/modules/example/module.ts`: consumes `exampleRateLimits` as its `rateLimits`.
- `src/modules/example/routes.ts`: presumably mounts `createExampleLimiter` on `POST /examples`. The doc comment names that route.
- `src/modules/example/tests/unit/manifest.test.ts`: a neighbor in the graph. Its content isn't visible here, so the exact check isn't known.

## Notes
- The numeric limits (window, max) are not defined in this file. They come from the generated data `exampleRateLimitData.exampleCreate`, imported from `./rate-limits.generated`.
