---
source: src/modules/cart/routes.ts
sha256: b423a930b18a0a87e7d667e8c46b1cf413c821458d8e659141d49d992ea8edd8
generated_at: 2026-11-08T05:16:11.946332+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/routes.ts

## Purpose
Defines the Express router that maps HTTP endpoints to cart controllers. It applies global authentication to every route, then wires each cart operation (CRUD on lines, checkout, merge, reorder, shipping) to its controller with the appropriate middleware chain. It is the single entry point through which all cart HTTP traffic flows.

## Key elements
- **`router`** (exported) — The Express `Router` instance. All cart endpoints are registered here.
- **`router.use(getAuth, isAuth)`** — Global middleware: every cart route requires a signed-in account. No per-route authorization rules gate the router.
- **`POST /checkout`** — The only route with a permission gate (`requirePermission('checkout','Cart')`), a fresh-session check (`requireFreshAuth('critical')`), a rate limiter (`checkoutLimiter`), an idempotency key, and a `products` cache invalidation before the handler.
- **`POST /merge`** — Protected by `mergeLimiter` and `idempotencyKey`; folds a guest cart into the caller's cart.
- **`POST /items`, `PATCH /items/:productId`, `DELETE /items/:productId`, `DELETE /items`** — Line-level CRUD. PATCH sets quantity on an existing line only; it never creates one.
- **`PUT /shipping-method`** — Select or clear the shipping method.
- **`POST /reorder`** — Copies a prior order back into the cart.
- **`GET /` and `GET /summary`** — Read the full cart or a lighter summary.

## Relationships
- **`src/modules/cart/module.ts`** — Mounts this router onto the application's `/cart` path.
- **`src/kernel/middlewares/authorizations.ts`** — Supplies `getAuth`, `isAuth`, `requireFreshAuth`, and `requirePermission` used in the middleware chains.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — Supplies the `idempotencyKey` middleware for the checkout and merge routes.
- **`src/infrastructure/http/middlewares/cache.ts`** — Supplies `invalidateCache`, called on checkout to bust the `products` response cache.
- **`src/modules/cart/rate-limits.ts`** — Supplies `checkoutLimiter` and `mergeLimiter`.
- **Each controller file** (`get-cart.ts`, `post-checkout.ts`, `delete-cart-item.ts`, etc.) — Provides the handler function bound to its route.

## Notes
- **Middleware order on `/checkout` is deliberate and load-bearing:** permission → fresh auth → rate limiter → idempotency → cache invalidation → handler. A refused caller never spends the rate-limit budget; a replayed request still counts against the limiter.
- **Middleware order on `/merge` differs:** `mergeLimiter` runs *before* `idempotencyKey` (the limiter guards against volume, not replay).
- **No route uses `Location` headers or per-line reads.** Writing a line goes through the parent `/items` collection and returns `200` with the whole cart.
- The permission key `checkout:Cart` is declared in `shared/authorization-keys.yaml`; it is the only key this module contributes.
