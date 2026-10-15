---
source: src/modules/wishlist/routes.ts
sha256: 18b082f54b8f33440cd2d68c964e432d0e911b7c0b04c607c84b40fb45000985
generated_at: 2026-10-15T12:27:26.737211+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/routes.ts

## Purpose

Defines the Express route table for the wishlist module. All routes are user-scoped (no admin surface) and sit behind authentication. The file is thin wiring: it declares route order, applies auth/permission middleware, and delegates to the corresponding controller functions.

## Key elements

- **`router`** (exported) — The `express.Router` instance. Mounted by the module and carrying four routes:
  - `GET /` → `getWishlist`
  - `POST /:productId/move-to-cart` → `postMoveToCart`
  - `PUT /:productId` → `putWishlistItem`
  - `DELETE /:productId` → `deleteWishlistItem`
- **Router-level middleware** — `getAuth` + `isAuth` applied via `router.use`, so every route is authenticated.
- **Route-level permission** — Only the move-to-cart route adds `requirePermission('cart.self.update')` on top of the base auth.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Source of `getAuth`, `isAuth`, and `requirePermission` used for middleware wiring.
- **`src/modules/wishlist/controllers/get-wishlist.ts`** — Handler for `GET /`.
- **`src/modules/wishlist/controllers/post-move-to-cart.ts`** — Handler for `POST /:productId/move-to-cart`.
- **`src/modules/wishlist/controllers/put-wishlist-item.ts`** — Handler for `PUT /:productId`.
- **`src/modules/wishlist/controllers/delete-wishlist-item.ts`** — Handler for `DELETE /:productId`.
- **`src/modules/wishlist/module.ts`** — Consumes the exported `router` and mounts it into the application.
- **`src/modules/wishlist/tests/unit/routes.test.ts`** — Unit-tests the route definitions and ordering in this file.

## Notes

- **Route order is load-bearing.** `/:productId/move-to-cart` must be declared before the bare `/:productId` routes. If reordered, Express will match `move-to-cart` as a `productId` parameter and the move-to-cart endpoint will 404.
- The move-to-cart route is the only one with an extra permission gate (`cart.self.update`). Rationale per the comment: the action writes a basket, and staff/admin roles do not shop.
- No route in this file is admin-scoped; the module intentionally exposes only user-facing wishlist operations.
