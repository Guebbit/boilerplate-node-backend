---
source: src/modules/cart/routes.ts
sha256: a568a06e9cfbedf463b77f44e6efd0af6a08a4946325eee2be25ddfb3af8efa4
generated_at: 2026-09-27T14:45:38.146679+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/routes.ts

## Purpose
Defines the Express route table for the cart module. Every route is behind authentication; `POST /checkout` additionally enforces a fresh re-auth session, a specific permission, idempotency, and cache invalidation. The file exists to declare route paths, mount ordering, and middleware chains in one place, delegating all business logic to individual controllers.

## Key elements
- **`router`** (exported `Router`) — the single public export; mounted by the cart module.
- **`router.use(getAuth, isAuth)`** — blanket auth guard applied to every cart route.
- **`POST /cart/checkout`** — the only route with extra middleware: `requireFreshAuth(REAUTH_TIME_CRITICAL)`, `requirePermission('cart.self.checkout')`, `idempotencyKey`, `invalidateCache(['products'])`, then delegates to `postCheckout`.
- **`DELETE /cart/all`** → `clearCart` — clears the entire cart.
- **`PUT /cart/shipping-method`** → `putCartShippingMethod` — sets shipping method.
- **`PUT /cart/:productId`** → `putCartItem` — sets quantity for a product.
- **`DELETE /cart/:productId`** → `deleteCartItem` — canonical single-item removal.
- **`DELETE /cart/`** → `deleteCartItem` — x-alias of the parametric delete (productId passed in body instead).
- **`GET /cart`** → `getCart`; **`GET /cart/summary`** → `getCartSummary`.
- **`POST /cart`** → `postCart`; **`POST /cart/reorder/:orderId`** → `postReorder`.

## Relationships
- **Controllers** (`get-cart`, `post-cart`, `put-cart-item`, `delete-cart-item`, `delete-cart-all`, `put-cart-shipping-method`, `post-checkout`, `post-reorder`, `get-cart-summary`) — imported as the terminal handler for each route.
- **`src/kernel/middlewares/authorizations.ts`** — source of `getAuth`, `isAuth`, `requireFreshAuth`, `requirePermission`, `REAUTH_TIME_CRITICAL`; the auth chain that protects every route and the checkout-specific re-auth/permission checks.
- **`src/infrastructure/http/middlewares/cache.ts`** — `invalidateCache(['products'])` is applied to the checkout route so that product/stock caches are flushed after an order spends inventory.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — `idempotencyKey` is applied to the checkout route to guarantee a retried request replays the same order.
- **`src/modules/cart/module.ts`** — mounts the exported `router` into the application's route tree.
- **`src/modules/cart/tests/unit/routes.test.ts`** — unit-tests the route definitions and middleware ordering in this file.
- **`tests/cross-cutting/step-up-auth-routes.test.ts`** — cross-cutting test verifying the `requireFreshAuth` + `requirePermission` chain on `POST /checkout`.

## Notes
- **Mount order is load-bearing.** `/all` and `/shipping-method` are registered *before* `/:productId`. Because Express matches in registration order, placing the parameterised route first would treat the literal strings `"all"` or `"shipping-method"` as a product ID.
- **Two DELETE spellings, one handler.** `DELETE /cart/` (body-carried productId) and `DELETE /cart/:productId` (path param) both call `deleteCartItem`. The former is documented as an x-alias.
- **`invalidateCache(['products'])`** is passed only the `'products'` tag here (the module comment mentions `orders` and `products`); the actual tag list is whatever is in the array literal — verify against `cache.ts` if you need the full set.
- The `cart.self.checkout` permission is the **only** permission key this module declares (per the module doc comment referencing `shared/authorization-keys.yaml`).
