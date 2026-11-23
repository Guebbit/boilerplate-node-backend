---
source: src/modules/cart/rate-limits.ts
source_sha256: d314b53b1c28f68685e78d57575f2999f146bce59c85fbfd68a58e6837fb0c9b
context_sha256: 911c5eb73b912cf02ff0c9e8150807f5e5e4a4deaf48a635289b680905043c0b
generated_at: 2026-11-22T04:34:36.706378+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/rate-limits.ts

## Purpose
Defines the cart module's own rate-limit budgets: one for `POST /cart/checkout` and one for `POST /cart/merge`. Budgets are plain data (`RateLimitBudget`), declared on `./module.ts`'s `rateLimits`, and turned into Express middleware by the shared `buildRateLimiter` factory that all modules use.

## Key elements
- `checkoutLimiter` — `RequestHandler` for `POST /cart/checkout`, built from `CHECKOUT_BUDGET`. Limits checkout attempts per window, per account. Every attempt counts, whether refused or placed.
- `mergeLimiter` — `RequestHandler` for `POST /cart/merge`, built from `MERGE_BUDGET`. Limits merges per account per window. Every request counts, replays included.
- `cartRateLimits` — `readonly RateLimitBudget[]` of `[CHECKOUT_BUDGET, MERGE_BUDGET]`, listed on the module's `rateLimits`.
- `CHECKOUT_BUDGET` / `MERGE_BUDGET` (not exported) — spread the numeric settings from `cartRateLimitData.checkout` and `cartRateLimitData.cartMerge` (imported from `./rate-limits.generated`). They then add `keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT` and `keyGenerator: accountIdOf`.

## Relationships
- `src/infrastructure/http/middlewares/rate-limit.ts` — supplies `buildRateLimiter`, `accountIdOf` and `KEYED_BY_AUTHENTICATED_ACCOUNT`, which this file uses.
- `src/types/rate-limit-budget.ts` / `src/types/index.ts` — provide the `RateLimitBudget` type, imported via the `@types` alias.
- `src/modules/cart/module.ts` — lists `cartRateLimits` as its `rateLimits`.
- `src/modules/cart/routes.ts` — the limiters are mounted on the checkout and merge routes.
- `src/modules/cart/tests/integration/checkout-rate-limit.test.ts` and `merge-rate-limit.test.ts` — integration tests for the two limiters.

## Notes
- Both budgets are keyed on the authenticated account, not the IP address. The routes require sign-in, and an IP key would reset per address for a stolen session.
- The merge budget exists because the global brake counts a large merge as a single request, which under-counts its work.
- Checkout is limited because each successful attempt holds stock, writes an order, burns an order number, sends mail and clears the products cache.
- The actual limits (window and size) come from `./rate-limits.generated`, not from this file. Change them there.
