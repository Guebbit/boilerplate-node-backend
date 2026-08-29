# src/modules/cart/routes.ts

## Purpose

Defines the Express router for all cart-related HTTP endpoints (list, add, update, remove items, checkout, reorder). Every route is authenticated. The router is the single wiring point that maps URLs to the module's controller functions and applies shared middleware.

## Key elements

- **`router`** (exported) — the `express.Router` instance. Consumers (typically `module.ts`) mount it under a base path.
- **Auth middleware** — `getAuth` and `isAuth` are applied via `router.use(...)`, so every route below requires a valid session.
- **Route handlers** (each delegates to a controller in `./controllers/`):
  - `GET /summary` → `getCartSummary`
  - `POST /checkout` → `invalidateCache(['orders','products'])` then `postCheckout`
  - `POST /reorder/:orderId` → `postReorder`
  - `GET /` → `getCart`
  - `POST /` → `postCart` (add or set an item)
  - `DELETE /` → `deleteCart` (clear the whole cart)
  - `PUT /:productId` → `putCartItem` (set quantity)
  - `DELETE /:productId` → `deleteCartItem` (remove one item)

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth` and `isAuth`; applied globally to this router so no route is publicly accessible.
- **`src/infrastructure/http/middlewares/cache.ts`** — provides `invalidateCache`, invoked *only* on the checkout route to purge the `orders` and `products` cache keys before the response is sent.
- **`src/modules/cart/controllers/*.ts`** (8 files) — each supplies the single controller function bound to its route; this file contains no business logic itself.
- **`src/modules/cart/module.ts`** — the module's entry point that presumably imports and mounts `router` on the app or a parent router.

## Notes

- Route ordering matters: the parameterless paths (`/`, `/summary`, `/checkout`) are declared **before** the parameterized `/:productId` routes. Moving them below would cause Express to match `/summary` as `:productId = "summary"` and skip the intended handler.
- `invalidateCache` is a per-route middleware, not global. No other cart mutation (add, remove, reorder) invalidates the cache here — if those operations should also bust caches, that's handled elsewhere or is an intentional omission.
- The reorder route (`POST /reorder/:orderId`) copies a *previously placed* order back into the cart; the `:orderId` param is the caller's own order (ownership is presumably enforced inside `postReorder`).
