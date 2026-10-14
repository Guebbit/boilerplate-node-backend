---
source: src/modules/cart/routes.ts
sha256: d724bd3b9b24fd81d4af8946a69c3d4e7b912d8ecb8a362a61ec9ff15705d63e
generated_at: 2026-10-14T15:10:27.350968+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/routes.ts

## Purpose
The Express route table for the cart domain. It wires the shared auth/authorization middleware chain, per-route security controls (fresh-auth, second permission, rate limiter, idempotency, cache invalidation), and the individual cart controller handlers onto a single `Router` instance. Every HTTP request under the cart path passes through this file before reaching a controller.

## Key elements
- **`router`** (exported) — the Express `Router` that `module.ts` mounts.
- **Router-level middleware** — `getAuth` → `isAuth` → `requirePermission('cart.self.update')` applied to every cart route; restricts access to shopper roles only.
- **`POST /checkout`** — the heaviest chain: `requireFreshAuth('critical')` → `requirePermission('cart.self.checkout')` → `checkoutLimiter` → `idempotencyKey` → `invalidateCache(['products'])` → `postCheckout`. The only route that busts the products response cache and the only one requiring a fresh session + a second permission.
- **`POST /merge`** — `mergeLimiter` → `idempotencyKey` → `postCartMerge`. Limiter sits before idempotency so a burst of retries is still counted.
- **`POST /reorder/:orderId`** — `postReorder`; copies an existing order back into the cart.
- **`GET /summary`** — `getCartSummary`.
- **`GET /`** — `getCart`.
- **`POST /`** — `postCart` (add/set item).
- **`DELETE /all`** — `clearCart`; mounted above `/:productId` to prevent Express from matching `"all"` as a product id.
- **`DELETE /`** — `deleteCartItem`; body-carried `productId`; alias of `DELETE /:productId`.
- **`PUT /shipping-method`** — `putCartShippingMethod`; mounted above `/:productId` for the same literal-segment reason.
- **`PUT /:productId`** — `putCartItem` (set quantity).
- **`DELETE /:productId`** — `deleteCartItem` (canonical remove-by-id).

## Relationships
- **`src/kernel/middlewares/authorizations.ts`** — source of `getAuth`, `isAuth`, `requireFreshAuth`, `requirePermission`; the entire auth chain for this router.
- **`src/infrastructure/http/middlewares/cache.ts`** — `invalidateCache` is called on the checkout route to bust the `products` cache after stock is spent.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — `idempotencyKey` on checkout and merge prevents duplicate orders or double-quantity adds on retry.
- **`src/modules/cart/rate-limits.ts`** — exports `checkoutLimiter` and `mergeLimiter`, applied per-route before the idempotency middleware.
- **`src/modules/cart/controllers/*.ts`** (10 files) — each provides one handler function invoked by a route in this file.
- **`src/modules/cart/module.ts`** — consumer; mounts `router` at the cart path in the app.

## Notes
- **Route order is load-bearing.** `/all`, `/shipping-method`, and `/summary` must be registered before `/:productId`; Express matches in declaration order and would otherwise treat those literal segments as product ids.
- **Two permission keys govern this module:** `cart.self.update` (all routes) and `cart.self.checkout` (checkout only). No other permissions are referenced here.
- **Middleware ordering on checkout is deliberate:** permission checks run before the limiter (a refused caller never consumes quota), and the limiter runs before `idempotencyKey` (a replayed request still counts against the rate limit).
- **`DELETE /` and `DELETE /:productId`** share the same handler (`deleteCartItem`); the former reads `productId` from the request body, the latter from the URL. They are functionally equivalent.
- **Checkout is the only route that invalidates a response cache.** No other cart mutation touches `products` or `orders` caches.
