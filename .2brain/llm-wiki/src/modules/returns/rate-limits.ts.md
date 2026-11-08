---
source: src/modules/returns/rate-limits.ts
sha256: e7394b78553359274219ea2c3dda0f9e63e3704249a8ec89b563abe66903b7e1
generated_at: 2026-11-08T08:00:58.369359+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/rate-limits.ts

## Purpose

Declares the Returns module's rate-limit budget for `POST /returns` and converts it into a ready-to-use Express middleware. It is the module-local "source of truth" for how many return-openings a single authenticated account may perform per window.

## Key elements

- **`RETURNS_WRITE_BUDGET`** (local const) — A `RateLimitBudget` built by spreading generated numeric data (`returnsRateLimitData.returnsWrite`) and overriding the keying strategy to `KEYED_BY_AUTHENTICATED_ACCOUNT` with `accountIdOf` as the key generator.
- **`returnsWriteLimiter`** (exported `RequestHandler`) — The result of passing that budget through `buildRateLimiter`. Applied as middleware to `POST /returns`.
- **`returnsRateLimits`** (exported `readonly RateLimitBudget[]`) — Array of this module's declared budgets; referenced by `module.ts`'s `rateLimits` list so the module can register/audit them in one place.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Supplies the `buildRateLimiter` factory, the `accountIdOf` key generator, and the `KEYED_BY_AUTHENTICATED_ACCOUNT` constant that this file imports and uses to construct the limiter.
- **`src/modules/returns/routes.ts`** — Consumes `returnsWriteLimiter` as the rate-limit middleware on the `POST /returns` route.
- **`src/modules/returns/module.ts`** — Aggregates `returnsRateLimits` into the module-level `rateLimits` registry.
- **`src/types/rate-limit-budget.ts`** (via `@types`) — Defines the `RateLimitBudget` shape that `RETURNS_WRITE_BUDGET` must satisfy.
- **`./rate-limits.generated`** — Provides the numeric `returnsRateLimitData.returnsWrite` values (window size, max, etc.) spread into the budget.

## Notes

- The numeric limits live in `./rate-limits.generated`, a generated file. To change a limit, update/regenerate that source rather than editing the spread here.
- Keying is per **authenticated account**, not per IP. Unauthenticated requests will not be rate-limited by this limiter (there is no account to key on).
- The JSDoc on `RETURNS_WRITE_BUDGET` intentionally explains the *business rationale* (staff read-time + email cost) rather than just the number—keep that context in mind when adjusting limits.
