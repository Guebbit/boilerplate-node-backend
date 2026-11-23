---
source: src/modules/cart/routes.ts
source_sha256: 35da6522e5a7d5c28cccf76b96e64aeae41f1a917482555726dee5b4d0d6f383
context_sha256: aa70eb236475937f5b4ee739bd7c2e72870145559abcadd3e6739029e8dfcdb0
generated_at: 2026-11-22T04:35:06.167175+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/routes.ts

## Purpose
Defines the Express router for the cart module. Every route requires a signed-in account, since a cart always belongs to the caller. It maps each cart endpoint to its controller and applies the per-route guards: rate limiting, idempotency and, for checkout, permission and fresh-session checks.

## Key elements
- `router`: the exported Express `Router`. It starts with `router.use(getAuth, isAuth)`. No role rule gates the router, and staff shop too.
- `GET /summary`: `getCartSummary`.
- `GET /`: `getCart`.
- `POST /items`: `idempotencyKey`, then `postCartItems`. It adds a line or grows an existing one.
- `PATCH /items/:productId`: `patchCartItem`. It sets the quantity of an existing line and never creates one.
- `DELETE /items/:productId`: `deleteCartItem`. It removes one line.
- `DELETE /items`: `clearCart`. It clears every line.
- `PUT /shipping-method`: `putCartShippingMethod`. It chooses or clears the shipping method.
- `POST /merge`: `mergeLimiter`, `idempotencyKey`, then `postCartMerge`. It folds a guest cart in.
- `POST /reorder`: `idempotencyKey`, then `postReorder`. It copies one of the caller's own orders back into the cart.
- `POST /checkout`, with middleware in this order:
  1. `requirePermission('checkout', 'Cart')`
  2. `requireFreshAuth('critical')`
  3. `checkoutLimiter`
  4. `idempotencyKey`
  5. `postCheckout`

## Relationships
- `@kernel/middlewares/authorizations` (`src/kernel/middlewares/authorizations.ts`) provides `getAuth`, `isAuth`, `requireFreshAuth` and `requirePermission`.
- `@infrastructure/http/middlewares/idempotency` (`src/infrastructure/http/middlewares/idempotency.ts`) provides `idempotencyKey`. It is applied to checkout, merge, reorder and add-items.
- `./rate-limits` provides `checkoutLimiter` and `mergeLimiter`.
- `./controllers/*` hold the handlers: `get-cart`, `get-cart-summary`, `post-cart-items`, `patch-cart-item`, `delete-cart-items` (exports `clearCart`), `delete-cart-item`, `post-checkout`, `post-reorder`, `post-cart-merge` and `put-cart-shipping-method`.
- `src/modules/cart/module.ts` is the module that owns this router. The file doesn't show how it is mounted.
- `src/modules/cart/tests/unit/routes.test.ts` is the unit test for this route table.

## Notes
- **Route order matters.** `/summary`, `/checkout`, `/merge` and `/reorder` are registered before the other routes. `/items/:productId` is registered last.
- **Checkout middleware order is deliberate.**
  - The permission check comes before the fresh-session check, so a caller who can never pass is refused rather than challenged.
  - `checkoutLimiter` comes after the permission check, so a refused caller never spends it.
  - `checkoutLimiter` comes before the idempotency ledger, so replayed retries still count.
- **Merge limiter order.** `mergeLimiter` comes first on `/merge` because one call carries many lines, each costing a product read and a cart write.
- **Checkout cache invalidation.** The header says checkout is the only route that also invalidates the `products` response cache. No such middleware appears in this file, so it is presumably handled elsewhere.
- **`checkout:Cart` is the only permission key this module declares.** It exists so an address nobody has confirmed can't place an order.
- **Idempotency on add.** A retry with the same key doesn't grow a line twice. A deliberate second click uses a new key and still adds.
- **Write responses.** A line is written through the parent's `/items` collection. The response is 200 with the whole cart, with no `Location` header and no read of a single line.
