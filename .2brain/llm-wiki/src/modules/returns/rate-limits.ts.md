---
source: src/modules/returns/rate-limits.ts
sha256: e7394b78553359274219ea2c3dda0f9e63e3704249a8ec89b563abe66903b7e1
generated_at: 2026-10-29T05:40:05.738394+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/rate-limits.ts

## Purpose

Defines the rate-limit budget for the Returns module's single write endpoint (`POST /returns`) and exposes it as ready-to-use Express middleware. It is the "declaration" step: it binds the numeric thresholds (sourced from the generated file) to a per-account keying strategy and hands the result to the shared `buildRateLimiter` factory, matching the pattern every other module follows.

## Key elements

- **`RETURNS_WRITE_BUDGET`** (module-local const, type `RateLimitBudget`) — Merges `returnsRateLimitData.returnsWrite` with `keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT` and `keyGenerator: accountIdOf`. Caps returns opened per window, per authenticated account.
- **`returnsWriteLimiter`** (exported, `RequestHandler`) — The compiled Express middleware; attach it to the `POST /returns` route to enforce the budget.
- **`returnsRateLimits`** (exported, `readonly RateLimitBudget[]`) — A one-element array exposing the budget so `module.ts` can register it in its `rateLimits` list.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Source of `buildRateLimiter`, `accountIdOf`, and `KEYED_BY_AUTHENTICATED_ACCOUNT`. This file is a *consumer* of that factory.
- **`src/modules/returns/rate-limits.generated.ts`** — Provides `returnsRateLimitData.returnsWrite` (the numeric window/limit values). This file does not hard-code thresholds.
- **`src/types/rate-limit-budget.ts` / `src/types/index.ts`** — Supply the `RateLimitBudget` type used to shape the budget object.
- **`src/modules/returns/module.ts`** — Consumes `returnsRateLimits` (and presumably `returnsWriteLimiter`) to wire the budget into the module's `rateLimits` declaration.
- **`src/modules/returns/routes.ts`** — Applies `returnsWriteLimiter` on the `POST /returns` route handler.

## Notes

- Limits are keyed **per authenticated account**, not per IP. Unauthenticated callers are not the target of this limiter.
- Threshold numbers live in the generated file; edit that (or its source-of-truth generator), not this file.
- The doc comment frames the budget as "well above a real customer's handful of returns and well below the global brake" — i.e., it sits between normal usage and the system-wide safety brake. Treat it as a business rule, not a security boundary.
- `returnsRateLimits` is a `readonly` array with exactly one element today; it exists so the module can list all its budgets in a single place for `module.ts` and tooling.
