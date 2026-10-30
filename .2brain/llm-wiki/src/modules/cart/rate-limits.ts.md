---
source: src/modules/cart/rate-limits.ts
sha256: a39e0b47cbbc5fe22772a96693ea693524ce013ec891f9c1082253d2865299dc
generated_at: 2026-10-29T03:23:12.486690+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/rate-limits.ts

## Purpose

Defines the cart module's two per-account rate-limit budgets (checkout and merge) and turns them into ready-to-use Express middleware. It pairs the numeric limits from the generated data file with the shared keying strategy so the cart module plugs into the same rate-limit pipeline as every other module.

## Key elements

- **`CHECKOUT_BUDGET`** (internal) — Budget object for `POST /cart/checkout`. Spreads the numeric values from `cartRateLimitData.checkout`, then sets `keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT` and `keyGenerator: accountIdOf`.
- **`checkoutLimiter`** (exported `RequestHandler`) — The Express middleware for the checkout route, produced by `buildRateLimiter(CHECKOUT_BUDGET)`.
- **`MERGE_BUDGET`** (internal) — Budget object for `POST /cart/merge`. Spreads `cartRateLimitData.cartMerge` with the same account-keying strategy.
- **`mergeLimiter`** (exported `RequestHandler`) — The Express middleware for the merge route, produced by `buildRateLimiter(MERGE_BUDGET)`.
- **`cartRateLimits`** (exported `readonly RateLimitBudget[]`) — The canonical list `[CHECKOUT_BUDGET, MERGE_BUDGET]`, referenced by `module.ts`'s `rateLimits` declaration.

## Relationships

- **`@infrastructure/http/middlewares/rate-limit`** — Supplies `buildRateLimiter` (the factory), `accountIdOf` (key generator), and `KEYED_BY_AUTHENTICATED_ACCOUNT` (keying constant).
- **`./rate-limits.generated.ts`** — Provides `cartRateLimitData` containing the numeric window/max values that are spread into each budget object.
- **`src/types/index.ts`** (→ `rate-limit-budget.ts`) — Source of the `RateLimitBudget` type used by all budget constants and the `cartRateLimits` export.
- **`./module.ts`** — Its `rateLimits` field lists this file's `cartRateLimits`, making the budgets visible to the module registry.
- **`./routes.ts`** — Consumes `checkoutLimiter` and `mergeLimiter` as route-level middleware on their respective endpoints.
- **Integration tests** (`checkout-rate-limit.test.ts`, `merge-rate-limit.test.ts`) — Exercise the exported limiters under simulated load to verify budget enforcement.

## Notes

- Numeric limits (window, max) live in the **generated** file; this file only adds the keying strategy. Change limits by regenerating, not by editing here.
- Both budgets are keyed on the **authenticated account**, not IP/address. The merge JSDoc explains why: an address key would reset per IP for a stolen session, and the route requires sign-in.
- Every attempt consumes budget regardless of outcome — a refused checkout still read basket and stock, a replayed merge still costs the same I/O.
- The merge budget exists because a single merge fans out into ~100 catalogue reads + cart writes; the global per-request brake would count it as one hit, under-counting real cost by ~100×.
