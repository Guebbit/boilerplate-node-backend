# src/modules/cart/routes.ts

## Purpose

Defines the Express router that maps all HTTP endpoints under the cart feature (view, add, update, remove, clear, checkout, reorder) to their controller handlers. The entire router is gated behind authentication, and the checkout route additionally invalidates response caches for `orders` and `products`.

## Key elements

- **`router`** (exported `Router`) — the single public export; mounted by the module registration in `module.ts`.
- **`getAuth` / `isAuth`** (from `@kernel/middlewares/authorizations`) — applied via `router.use()` so every cart route requires an authenticated user.
- **`invalidateCache(['orders', 'products'])`** (from `@infrastructure/http/middlewares/cache`) — applied only to `POST /checkout` to bust the response caches that serve those two resources.
- **Route table** — `GET /summary`, `POST /checkout`, `POST /reorder/:orderId`, `GET /`, `POST /`, `DELETE /all`, `DELETE /`, `PUT /:productId`, `DELETE /:productId`. Each maps to a controller in `./controllers/`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — source of `getAuth` and `isAuth`; without these the router would be unauthenticated.
- **`src/infrastructure/http/middlewares/cache.ts`** — source of `invalidateCache`; the checkout route depends on it to clear stale `orders`/`products` responses.
- **`src/modules/cart/controllers/*`** — each imported controller is the terminal handler for one or more routes defined here.
- **`src/modules/cart/module.ts`** — registers/exports this router to the application's route tree.
- **`src/modules/cart/tests/unit/routes.test.ts`** — unit-tests the route table in this file.
- **`tests/cross-cutting/authenticated-controllers.test.ts`** — asserts that all handlers reachable through this router are behind auth.
- **`tests/cross-cutting/write-routes-are-guarded.test.ts`** — asserts that mutating routes (POST/PUT/DELETE) are guarded.

## Notes

- **Mount order is intentional.** `DELETE /all` (and `GET /summary`) must appear *before* `PUT|DELETE /:productId` in registration order; otherwise Express would match the literal string `"all"` (or `"summary"`) as a `:productId` parameter. See the module doc comment and the convention referenced in `CONTRACT_PLAN_POLYMORPHISM.md` ("Mount `/search` before `/:id`").
- **Two DELETE spellings, one handler.** `DELETE /cart` reads `productId` from the request body; `DELETE /cart/:productId` reads it from the URL. Both call the same `deleteCartItem` controller.
- **Only `/checkout` touches the cache layer.** No other cart route invalidates or reads through `invalidateCache`.
