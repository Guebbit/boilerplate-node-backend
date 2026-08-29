# src/modules/wishlist/routes.ts

## Purpose

Express route definitions for the wishlist module. It wires the four wishlist HTTP endpoints (list, save, move-to-cart, remove) to their respective controllers and enforces authentication on every route, since a wishlist is inherently user-specific.

## Key elements

- **`router`** (exported `Router`) — the sole export; mounted by the module to expose the `/wishlist` path group.
- **`router.use(getAuth, isAuth)`** — applies the auth middlewares to all subsequent routes in this router.
- **`GET /`** → `getWishlist` — returns the caller's saved wishlist.
- **`POST /`** → `postWishlist` — saves a product to the wishlist (idempotent).
- **`POST /:productId/move-to-cart`** → `postMoveToCart` — transfers a saved product into the cart.
- **`DELETE /:productId`** → `deleteWishlistItem` — removes one product from the wishlist.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth` and `isAuth`, applied globally to this router via `router.use`.
- **`src/modules/wishlist/controllers/get-wishlist.ts`** — handler for `GET /`.
- **`src/modules/wishlist/controllers/post-wishlist.ts`** — handler for `POST /`.
- **`src/modules/wishlist/controllers/post-move-to-cart.ts`** — handler for `POST /:productId/move-to-cart`.
- **`src/modules/wishlist/controllers/delete-wishlist-item.ts`** — handler for `DELETE /:productId`.
- **`src/modules/wishlist/module.ts`** — consumes the exported `router` and mounts it in the application's route tree.

## Notes

- **Route ordering matters.** `/:productId/move-to-cart` is declared *before* `/:productId`; swapping them would cause Express to match the DELETE pattern and 404 the move-to-cart POST.
- Authentication is enforced at the **router level** (`router.use`), not per-route. Adding a new route to this router automatically requires auth; a public endpoint would need to be defined outside this router or the `use` call restructured.
