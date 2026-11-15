---
source: src/modules/cart/routes.ts
sha256: e72e348eedadde4ad045b6b442ee6309cadba19856e967aaa1158fbef944e70a
generated_at: 2026-11-14T19:30:05.079947+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/routes.ts

## Purpose

Defines the Express route table for the cart domain. It wires each cart HTTP endpoint to its controller, applies the shared auth middleware, and layers per-route middleware (permissions, rate limits, idempotency, cache invalidation) in a specific order that matters for safety.

## Key elements

- **`router`** (exported) — The Express `Router` instance. All routes are registered on it.
- **`router.use(getAuth, isAuth)`** — Applies to every cart route: the caller must be a signed-in account. No further authorization rule gates the router itself.
- **`POST /checkout`** — The highest-trust route. Middleware chain: `requirePermission('checkout', 'Cart')` → `requireFreshAuth('critical')` → `checkoutLimiter` → `idempotencyKey` → `invalidateCache(['products'])` → `postCheckout`.
- **`POST /merge`** — Folds a guest cart into the caller's. Uses `mergeLimiter` then `idempotencyKey`.
- **`POST /reorder`** — Copies a prior order back into the cart. Uses `idempotencyKey`.
- **`POST /items`** — Adds or grows a cart line. Uses `idempotencyKey`.
- **`DELETE /items`** (no param) — Clears every line (`clearCart`).
- **`PATCH /items/:productId`** — Sets quantity of an existing line; never creates one.
- **`DELETE /items/:productId`** — Removes one line.
- **`PUT /shipping-method`** — Chooses or clears the shipping method.
- **`GET /`** and **`GET /summary`** — Read the full cart or a lightweight summary.

## Relationships

- **`src/modules/cart/controllers/post-checkout.ts`** — `postCheckout` handles `POST /checkout`.
- **`src/modules/cart/controllers/post-cart-merge.ts`** — `postCartMerge` handles `POST /merge`.
- **`src/modules/cart/controllers/post-reorder.ts`** — `postReorder` handles `POST /reorder`.
- **`src/modules/cart/controllers/post-cart-items.ts`** — `postCartItems` handles `POST /items`.
- **`src/modules/cart/controllers/delete-cart-items.ts`** — `clearCart` handles `DELETE /items`.
- **`src/modules/cart/controllers/patch-cart-item.ts`** — `patchCartItem` handles `PATCH /items/:productId`.
- **`src/modules/cart/controllers/delete-cart-item.ts`** — `deleteCartItem` handles `DELETE /items/:productId`.
- **`src/modules/cart/controllers/put-cart-shipping-method.ts`** — `putCartShippingMethod` handles `PUT /shipping-method`.
- **`src/modules/cart/controllers/get-cart.ts`** — `getCart` handles `GET /`.
- **`src/modules/cart/controllers/get-cart-summary.ts`** — `getCartSummary` handles `GET /summary`.
- **`src/kernel/middlewares/authorizations.ts`** — Supplies `getAuth`, `isAuth`, `requireFreshAuth`, and `requirePermission` used to gate access.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — `idempotencyKey` is applied to all write routes that mutate quantities (`/checkout`, `/merge`, `/reorder`, `/items`) so a retried request replays rather than double-applies.
- **`src/infrastructure/http/middlewares/cache.ts`** — `invalidateCache(['products'])` runs after checkout so downstream product reads reflect the now-spent stock.
- **`src/modules/cart/rate-limits.ts`** — `checkoutLimiter` and `mergeLimiter` bound request frequency on the two most expensive write routes.

## Notes

- Middleware ordering on `POST /checkout` is deliberate: permission check comes before the rate limiter (a refused caller never spends a token), and the rate limiter comes before `idempotencyKey` (a retry storm still counts against the limiter even if it replays).
- `requireFreshAuth('critical')` enforces a FRESH session at checkout — not just a valid token — to prevent a stolen long-lived token from spending money.
- The `checkout:Cart` permission key is the only authorization key this module declares (see `shared/authorization-keys.generated.yaml`).
- Line-level writes (`POST /items`, `PATCH /items/:productId`) follow the convention that a line is written through the parent `/items` collection: responses return `200` + the whole cart, no `Location` header, no sub-resource read.
- `PATCH /items/:productId` explicitly never *creates* a line; use `POST /items` for that.
