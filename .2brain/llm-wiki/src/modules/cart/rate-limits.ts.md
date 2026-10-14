---
source: src/modules/cart/rate-limits.ts
sha256: cf4bee89ccd14eed5d323092b6c679efd1a3d986f87f854ab195ad8c3618a826
generated_at: 2026-10-14T15:09:31.806726+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/rate-limits.ts

## Purpose

Defines the two per-account rate-limit budgets that protect the cart module's expensive endpoints (`POST /cart/checkout` and `POST /cart/merge`), and exports the resulting Express middleware handlers plus a registry array consumed by the module declaration.

## Key elements

- **`CHECKOUT_BUDGET`** (local) — Budget config for checkout: default 10 per shared window, keyed by authenticated account, `audited: true`, override via `NODE_CHECKOUT_RATE_LIMIT_MAX`.
- **`checkoutLimiter`** (export) — Express `RequestHandler` built from `CHECKOUT_BUDGET`; applied to `POST /cart/checkout`.
- **`MERGE_BUDGET`** (local) — Budget config for merge: default 10 per shared window, keyed by authenticated account, `audited: true`, override via `NODE_CART_MERGE_RATE_LIMIT_MAX`.
- **`mergeLimiter`** (export) — Express `RequestHandler` built from `MERGE_BUDGET`; applied to `POST /cart/merge`.
- **`cartRateLimits`** (export) — `readonly RateLimitBudget[]` containing both budgets; the canonical list referenced by the module's `rateLimits` declaration.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Supplies `buildRateLimiter` (budget → middleware factory), `accountIdOf` (key generator), and the `KEYED_BY_AUTHENTICATED_ACCOUNT` constant used by both budgets.
- **`src/modules/cart/module.ts`** — Imports `cartRateLimits` and lists it in the module's `rateLimits` array so the budgets are discoverable/auditable at the module level.
- **`src/modules/cart/routes.ts`** — Applies `checkoutLimiter` and `mergeLimiter` as route middleware on their respective endpoints.
- **`src/modules/cart/tests/integration/checkout-rate-limit.test.ts`** — Integration tests exercising the checkout budget.
- **`src/modules/cart/tests/integration/merge-rate-limit.test.ts`** — Integration tests exercising the merge budget.
- **`src/types/rate-limit-budget.ts`** — Declares the `RateLimitBudget` interface used by both budget objects.
- **`src/types/index.ts`** — Re-exports `RateLimitBudget`; this file imports it via the `@types` alias.

## Notes

- Both budgets use `windowMs: 'shared'`, meaning they do **not** get their own independent time window; they participate in a shared window governed by the infrastructure layer.
- Keying is deliberately on the **authenticated account** (not IP or address): checkout prevents one account behind a shared address from starving others; merge prevents a stolen session from resetting the counter per IP.
- Every request counts toward the budget, including refused or replayed ones — the budget measures *attempts*, not successful operations.
- If you add a new cart endpoint that needs rate-limiting, add its budget object here, export a built limiter, and include it in `cartRateLimits` so `module.ts` stays in sync.
