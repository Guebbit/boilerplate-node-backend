---
source: src/modules/cart/rate-limits.ts
sha256: a39e0b47cbbc5fe22772a96693ea693524ce013ec891f9c1082253d2865299dc
generated_at: 2026-11-08T05:15:43.128841+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/rate-limits.ts

## Purpose

Declares the two cart-specific rate-limit budgets (checkout and merge) and converts them into ready-to-use Express middleware via the shared `buildRateLimiter` factory. It exists because these two endpoints are the most expensive per-request operations in the cart module and need per-account limits beyond the global brake.

## Key elements

- **`CHECKOUT_BUDGET`** (internal) — `RateLimitBudget` config for `POST /cart/checkout`. Sourced from `cartRateLimitData.checkout` (generated file), keyed by authenticated account. Every attempt counts, refused or placed.
- **`checkoutLimiter`** (exported `RequestHandler`) — Express middleware for the checkout route.
- **`MERGE_BUDGET`** (internal) — `RateLimitBudget` config for `POST /cart/merge`. Sourced from `cartRateLimitData.cartMerge`, keyed by authenticated account. Justified because one merge ≈ 100 catalogue reads + cart writes, which the global brake under-counts.
- **`mergeLimiter`** (exported `RequestHandler`) — Express middleware for the merge route.
- **`cartRateLimits`** (exported `readonly RateLimitBudget[]`) — The two budgets in an array; consumed by `module.ts` to register them on the module's `rateLimits` manifest.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Provides `buildRateLimiter`, `accountIdOf`, and `KEYED_BY_AUTHENTICATED_ACCOUNT`; the factory and keying primitives used to construct both limiters.
- **`src/modules/cart/module.ts`** — Imports `cartRateLimits` and lists them under the module's `rateLimits` declaration.
- **`src/modules/cart/routes.ts`** — Applies `checkoutLimiter` to `POST /cart/checkout` and `mergeLimiter` to `POST /cart/merge`.
- **`src/types/index.ts`** / **`src/types/rate-limit-budget.ts`** — Define the `RateLimitBudget` interface re-exported via the `@types` alias.
- **`src/modules/cart/tests/integration/checkout-rate-limit.test.ts`** — Integration tests exercising `checkoutLimiter` under load.
- **`src/modules/cart/tests/integration/merge-rate-limit.test.ts`** — Integration tests exercising `mergeLimiter` under load.

## Notes

- Numeric limits live in `rate-limits.generated.ts` (imported as `cartRateLimitData`); this file only wires them into keyed budgets.
- Both budgets are deliberately keyed by **account**, not IP/address. The merge budget's doc comment calls out the reason: an IP key would reset on every new address, letting a stolen session hammer the cart indefinitely.
- Budgets count **every** request that reaches the middleware, including refused checkouts and replayed merges—the cost is the request itself, not its outcome.
- The global rate-limit brake (applied elsewhere) still runs in front of these; these budgets are a second, per-account layer specifically for the two most expensive cart operations.
