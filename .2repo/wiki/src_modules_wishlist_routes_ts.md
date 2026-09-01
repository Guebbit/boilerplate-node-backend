# src/modules/wishlist/routes.ts

## Purpose

Defines the Express route table for all wishlist operations (save, unsave, move-to-cart). The entire router is wrapped with authentication middleware because a wishlist is inherently per-user. This file is the single wiring point between the wishlist controllers and the module's HTTP layer.

## Key elements

- **`router`** (exported) — Express `Router` instance carrying all wishlist routes. Consumed by `module.ts` to mount on the app.
- **`router.use(getAuth, isAuth)`** — Applies authentication to every route below it. No route is admin-gated.
- **`GET /`** → `getWishlist` — Fetch the current user's wishlist.
- **`POST /`** → `postWishlist` — Save a product (idempotent).
- **`POST /:productId/move-to-cart`** → `postMoveToCart` — Move a saved product into the cart.
- **`DELETE /:productId`** → `deleteWishlistItem` — Remove one saved product.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Source of `getAuth` and `isAuth`; applied via `router.use` so every wishlist route is auth-guarded.
- **`src/modules/wishlist/controllers/*`** — The four handler functions (`getWishlist`, `postWishlist`, `postMoveToCart`, `deleteWishlistItem`) are imported and bound to the routes above.
- **`src/modules/wishlist/module.ts`** — Imports and mounts `router` into the application.
- **`src/modules/wishlist/tests/unit/routes.test.ts`** — Unit-tests the route table (method, path, handler binding, auth middleware).
- **`tests/cross-cutting/authenticated-controllers.test.ts`** — Verifies that controllers behind this router enforce auth.
- **`tests/cross-cutting/write-routes-are-guarded.test.ts`** — Cross-cutting check that all `POST`/`DELETE` routes (including the ones here) sit behind authentication.

## Notes

- **Route ordering is load-bearing.** `POST /:productId/move-to-cart` must be registered *before* `DELETE /:productId` (and any future bare `/:productId` route). If reordered, Express matches the first pattern, and a `move-to-cart` request would be interpreted as a product literally named `"move-to-cart"`.
- All routes are user-scoped; there is deliberately no admin path in this router.
- The file is a `@module` (no named exports beyond `router`), so consumers import the default-ish `router` binding only.
