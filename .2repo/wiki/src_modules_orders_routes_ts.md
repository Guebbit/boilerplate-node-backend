# src/modules/orders/routes.ts

## Purpose

Express router that defines every HTTP endpoint for the orders module. It layers authentication, authorization, cache invalidation, and route-flag middleware around thin controller handlers so that callers never need to know those concerns.

## Key elements

- **`router`** – The exported `Router` instance. All routes are mounted here and the module-level `router.use(getAuth, isAuth)` enforces authentication on every endpoint.
- **`cacheOrdersSearch`** – A pre-built `searchCache('orders', searchOrdersKeyParameters)` middleware shared by `POST /search` and `GET /`.
- **Route table** – Eleven endpoints covering list, create, update, delete, cancel, invoice, and hard-delete. Static segments (`/search`, `/:id/invoice`, `/:id/hard`) are deliberately ordered before the generic `/:id` so Express does not swallow them.
- **Authorization split** – `isAdmin` gates all mutating routes except `POST /:id/cancel`, which is the single write a non-admin owner can perform.

## Relationships

- **`@kernel/middlewares/authorizations`** – Supplies `getAuth`, `isAuth`, and `isAdmin`; applied globally and per-route.
- **`@infrastructure/http/middlewares/cache`** – Supplies `searchCache`, `setCache`, and `invalidateCache`; used to key read caches and to bust `['orders']` / `['orders', 'products']` tags on every write.
- **`@infrastructure/http/middlewares/route-flag`** – Supplies `routeFlag('hardDelete')` so `DELETE /:id/hard` sets the same flag as a `?hardDelete=true` query parameter on `DELETE /:id`.
- **Controllers** (`get-orders`, `write-orders`, `delete-orders`, `get-order-item`, `get-order-invoice`, `post-cancel-order`) – Imported as the terminal handlers for each route.
- **`src/modules/orders/module.ts`** – Mounts the exported `router` into the application's route tree.
- **`src/modules/orders/tests/unit/routes.test.ts`** – Unit-test coverage for this file's route wiring.
- **`tests/cross-cutting/authenticated-controllers.test.ts`** / **`write-routes-are-guarded.test.ts`** – Cross-cutting suites that assert auth and admin guards are present on the routes defined here.

## Notes

- **Order is load-bearing.** `POST /search`, `GET /:id/invoice`, and `DELETE /:id/hard` must remain above `GET /:id` / `DELETE /:id`; reordering them silently breaks those paths.
- **Two hard-delete entry points.** `DELETE /:id?hardDelete=true` and `DELETE /:id/hard` hit the same `deleteOrders` handler; the `routeFlag` middleware normalises the path-based form into the same query-parameter contract.
- **Cache TTLs are hardcoded** at 3 600 s for `/:id` and `/:id/invoice` reads; there is no configuration or override.
- **`POST /:id/cancel` invalidates both `orders` and `products` tags**, while other admin writes invalidate only `orders` (except `POST /` create, which also touches `products`).
