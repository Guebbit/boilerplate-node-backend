---
source: src/modules/wishlist/routes.ts
sha256: 8b68211016e9a4b2ca0d48de66fb6e6c5229cba0e5e1c497c859e1178af4934b
generated_at: 2026-09-23T19:48:18.143303+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/routes.ts

## Purpose

Defines the Express route table for the wishlist module. It wires HTTP verbs and paths to the wishlist controllers, enforces authentication on every route, and handles the one ordering constraint that would otherwise cause silent mis-routing.

## Key elements

- **`router`** (exported `Router`) — The sole export. An Express router with `getAuth` and `isAuth` applied globally via `router.use`, so every endpoint requires an authenticated user.
- **`GET /`** → `getWishlist` — Return the caller's wishlist.
- **`POST /`** → `postWishlist` — Save a product to the wishlist (idempotent).
- **`POST /:productId/move-to-cart`** → `postMoveToCart` — Move a saved product into the cart.
- **`DELETE /:productId`** → `deleteWishlistItem` — Remove one saved product.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Provides `getAuth` and `isAuth`; applied to the entire router so no wishlist route is accessible unauthenticated or by admins specifically.
- **`src/modules/wishlist/controllers/get-wishlist.ts`**, **`post-wishlist.ts`**, **`post-move-to-cart.ts`**, **`delete-wishlist-item.ts`** — Each is imported and bound to its corresponding route. This file is their sole routing entry point.
- **`src/modules/wishlist/module.ts`** — Mounts the exported `router` onto the application at the wishlist base path.
- **`src/modules/wishlist/tests/unit/routes.test.ts`** — Unit-tests the route table (paths, verbs, middleware order).
- **`tests/support/routed-modules.ts`** — Test-harness helper that mounts the module (and thus this router) for integration/supertest coverage.

## Notes

- **Route order is load-bearing.** `POST /:productId/move-to-cart` is declared *before* `DELETE /:productId`. If reordered, Express would match the literal string `"move-to-cart"` as a `:productId` and the move-to-cart handler would never fire. The module-level JSDoc calls this out explicitly; preserve the order when adding new `/:productId` routes.
- No admin authorization middleware is used anywhere in this file — wishlist is strictly a user-facing, per-account resource.
- All controllers are imported as named exports; the file adds no business logic itself.
