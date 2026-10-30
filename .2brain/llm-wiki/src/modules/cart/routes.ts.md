---
source: src/modules/cart/routes.ts
sha256: 22274d439e5bc1ac8f9860ba45a8f96731b76ac9c81b574c47be38f5fb6e7dd7
generated_at: 2026-10-29T03:23:43.124134+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/routes.ts

## Purpose

Defines the Express router for all cart endpoints (read, mutate, merge, reorder, checkout). Every route is authenticated and scoped to the caller's own basket via the `update:Cart` permission; `POST /checkout` additionally demands a fresh session with `checkout:Cart`.

## Key elements

- **`router`** (exported `Express.Router`) — the single public export; mounted by the cart module.
- **Router-level middleware** — `getAuth`, `isAuth`, `requirePermission('update', 'Cart')` applied to every route via `router.use`.
- **`POST /cart/checkout`** — layered chain: `requirePermission('checkout','Cart')` → `requireFreshAuth('critical')` → `checkoutLimiter` → `idempotencyKey` → `invalidateCache(['products'])` → `postCheckout`. The only route that touches the product response cache.
- **`POST /cart/merge`** — `mergeLimiter` → `idempotencyKey` → `postCartMerge`; folds a guest cart into the caller's.
- **`POST /cart/reorder`** — copies a prior order back into the cart (`postReorder`).
- **`GET /cart/summary`**, **`GET /cart`** — read endpoints (`getCartSummary`, `getCart`).
- **`POST /cart/items`**, **`PATCH /cart/items/:productId`**, **`DELETE /cart/items/:productId`**, **`DELETE /cart/items`** (clear all) — line-level mutations under the `/items` collection.
- **`PUT /cart/shipping-method`** — set or clear the shipping method.

## Relationships

- **`src/modules/cart/module.ts`** — mounts this router under the cart path prefix.
- **`src/modules/cart/controllers/*`** (all eleven controllers listed) — each is the terminal handler for one route; this file only wires them to paths and middleware.
- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuth`, `requireFreshAuth`, `requirePermission` used at both router level and per-route.
- **`src/infrastructure/http/middlewares/cache.ts`** — `invalidateCache(['products'])` is invoked on checkout so downstream product reads reflect spent stock.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — `idempotencyKey` guards checkout and merge against duplicate side-effects on retry.
- **`src/modules/cart/rate-limits.ts`** — exports `checkoutLimiter` and `mergeLimiter`, applied before idempotency so rejected callers never consume a ledger entry.

## Notes

- Middleware order on `/checkout` is intentional and documented inline: permission check before fresh-auth (refused callers are not challenged), limiter before idempotency (retries still count toward the cap), idempotency before cache invalidation (a replayed request still invalidates once).
- `PATCH /items/:productId` updates an existing line only; it never creates one. Use `POST /items` to add.
- `DELETE /cart/items` (no param) clears the entire cart; `DELETE /cart/items/:productId` removes a single line.
- The file header documents that `update:Cart` and `checkout:Cart` are the only keys this module declares (see `shared/authorization-keys.yaml`).
