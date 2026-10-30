---
source: src/modules/wishlist/routes.ts
sha256: 7b994fdc17a925aa9a024e8292889486f23927107eb5ef795f378e059d216cf7
generated_at: 2026-10-29T06:34:53.023787+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/routes.ts

## Purpose
Defines the Express route table for the wishlist feature. All routes are authenticated (a wishlist belongs to a user) and none require admin. This file wires HTTP methods/paths to their controller handlers and applies the shared auth middleware in one place.

## Key elements
- **`router`** (exported) — the `express.Router()` instance that `module.ts` mounts.
- **`router.use(getAuth, isAuth)`** — applies authentication to every wishlist route uniformly.
- **`GET /`** → `getWishlist` — fetch the caller's wishlist.
- **`POST /items`** → `postWishlistItems` — save a product; saving an already-saved product is a no-op.
- **`POST /items/:productId/move-to-cart`** → `postMoveToCart` — moves a saved item into the caller's basket; guarded by an additional `requirePermission('update', 'Cart')`.
- **`DELETE /items/:productId`** → `deleteWishlistItem` — removes one saved product.

## Relationships
- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuth`, and `requirePermission`, which this file imports and applies.
- **`src/modules/wishlist/controllers/get-wishlist.ts`**, **`post-wishlist-items.ts`**, **`delete-wishlist-item.ts`**, **`post-move-to-cart.ts`** — the four controller handlers this router dispatches to.
- **`src/modules/wishlist/module.ts`** — consumes the exported `router` to mount these routes in the broader app.
- **`src/modules/wishlist/tests/unit/routes.test.ts`** — unit-tests the route table (paths, methods, middleware order).

## Notes
- The `move-to-cart` route is the only one with an extra authorization layer (`requirePermission('update', 'Cart')`) beyond the base `getAuth`/`isAuth` applied by `router.use`. When adding new routes, remember the permission middleware is per-route, not global.
- The file's module doc-block references `docs/api/write-methods.md#a-line-is-written-through-its-parent` for the convention that a child resource (`/items`) is written through its parent path rather than as a separate top-level route.
