---
source: src/modules/wishlist/routes.ts
sha256: b56a73d569e507602e9fe1b4b7e4b50a08bdec045c2c43555237ae2c50ce64a0
generated_at: 2026-11-08T09:13:59.784224+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/routes.ts

## Purpose

Defines the Express router for the wishlist resource. Because a wishlist is inherently personal, every route in this router requires authentication (no admin variant). The file wires URL patterns to thin controller functions and applies the auth middleware once at the router level.

## Key elements

- **`router`** (exported) — The sole export. An `express.Router` with four routes:
  - `GET /` → `getWishlist` — returns the caller's saved items.
  - `POST /items` → `postWishlistItems` — saves a product (idempotent: re-saving is a no-op).
  - `POST /items/:productId/move-to-cart` → `postMoveToCart` — transfers a saved product into the caller's basket.
  - `DELETE /items/:productId` → `deleteWishlistItem` — removes one saved product.
- **`router.use(getAuth, isAuth)`** — Applied before all routes; guarantees every handler runs with an authenticated, non-admin user.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Source of `getAuth` and `isAuth`, the two middlewares guarding every wishlist route.
- **`src/modules/wishlist/controllers/get-wishlist.ts`**, **`post-wishlist-items.ts`**, **`post-move-to-cart.ts`**, **`delete-wishlist-item.ts`** — Each provides the single handler function for one route; the router is their only consumer.
- **`src/modules/wishlist/module.ts`** — Mounts the exported `router` into the app under the `/wishlist` prefix.
- **`src/modules/wishlist/tests/unit/routes.test.ts`** — Unit-tests the route table (path registration, method mapping, middleware order).

## Notes

- Auth is applied at the router level via `router.use(...)`, so individual handlers do **not** re-check authorization. If a future route needs different permissions, it must override this by re-applying middleware after the blanket `use`.
- The `move-to-cart` route deliberately requires no additional rule beyond being signed in (the doc comment notes it writes the caller's own basket).
- Route paths are relative (no leading `/wishlist`); the full URL is produced by whatever mounts the router in `module.ts`.
