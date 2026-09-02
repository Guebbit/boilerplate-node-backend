# src/modules/cart/routes.ts

## Purpose

Defines the Express route table for the cart domain. Every route is behind authentication, and `POST /checkout` additionally demands a fresh (re-authenticated) session and invalidates the `orders` and `products` response caches. The file also encodes a mount-order contract: static segments (`/summary`, `/all`) must be registered before the parameterised `/:productId` routes so Express does not swallow them as product IDs.

## Key elements

- **`router`** (exported `Router`) – the single public export; all cart endpoints hang off it.
- **`router.use(getAuth, isAuth)`** – blanket authentication applied to every cart route.
- **`POST /checkout`** – the only route with two extra middlewares: `requireFreshAuth(REAUTH_TIME_CRITICAL)` and `invalidateCache(['orders', 'products'])`, in that order, before the `postCheckout` handler.
- **`DELETE /all`** – clear the entire cart; mounted before `/:productId` to avoid the literal string `all` being captured as a product ID.
- **`DELETE /`** – remove a single item by `productId` in the request body; documented as an *x-alias-of* `DELETE /:productId` (same handler, `deleteCartItem`).
- **`PUT /:productId`** – set quantity for one line item (`putCartItem`).
- **`DELETE /:productId`** – canonical spelling for removing one line item (`deleteCartItem`).
- **`POST /reorder/:orderId`** – copy a prior order back into the cart (`postReorder`).
- **`GET /summary`**, **`GET /`**, **`POST /`** – read summary, read full cart, add/set an item.

## Relationships

- **`@kernel/middlewares/authorizations`** – provides `getAuth`, `isAuth`, `requireFreshAuth`, and the `REAUTH_TIME_CRITICAL` constant consumed here.
- **`@infrastructure/http/middlewares/cache`** – `invalidateCache(['orders', 'products'])` is applied only to the checkout route, signalling that a completed checkout changes the data served by those two cached endpoints.
- **`./controllers/*`** – each route maps to exactly one controller function (`getCart`, `getCartSummary`, `postCart`, `putCartItem`, `clearCart`, `deleteCartItem`, `postCheckout`, `postReorder`).
- **`src/modules/cart/module.ts`** – the module aggregator that mounts this router into the application.
- **`src/modules/cart/tests/unit/routes.test.ts`** – unit tests exercising the route table directly.
- **`tests/cross-cutting/authenticated-controllers.test.ts`**, **`step-up-auth-routes.test.ts`**, **`write-routes-are-guarded.test.ts`** – integration tests that assert the auth / re-auth / write-guard middleware chain declared here.

## Notes

- **Mount order is load-bearing.** `/summary` and `/all` must stay above `/:productId`. Reordering them silently breaks `DELETE /cart/all` and `GET /cart/summary` (Express matches `:productId` = `"all"` / `"summary"`). The module docstring references `CONTRACT_PLAN_POLYMORPHIC.md` for the analogous `/search`-before-`/:id` rule.
- **Two ways to delete one item.** `DELETE /` (productId in body) and `DELETE /:productId` share the same handler. Both exist; prefer the parameterised form in new code.
- **`POST /checkout` is the only money-moving route** and the only one that requires a fresh session beyond plain `isAuth`. Any change to its middleware list or order should be paired with an update to the step-up-auth cross-cutting test.
