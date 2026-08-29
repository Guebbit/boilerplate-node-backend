# src/modules/orders/routes.ts

## Purpose
Express router that wires all HTTP endpoints for order CRUD and cancellation to their controllers, applying shared authentication, role-based authorization, response caching, and cache invalidation in the correct order.

## Key elements
- **`router`** (exported) — the Express `Router` instance consumed by the orders module; all order endpoints hang off it.
- **Route table** — the following handlers are registered (order matters for Express matching):
  - `POST /search` → `getOrders` (cached 1 h, key derived from `searchOrdersKeyParameters`)
  - `GET /` → `getOrders` (same cache config; non-admin sees own orders only)
  - `POST /` → `writeOrders` (admin; invalidates `orders` + `products` tags)
  - `PUT /` → `writeOrders` (admin; id in body)
  - `DELETE /` → `deleteOrders` (admin; id in body)
  - `POST /:id/cancel` → `postCancelOrder` (owner or admin; invalidates `orders` + `products`)
  - `GET /:id/invoice` → `getOrderInvoice` (cached 1 h)
  - `GET /:id` → `getOrderItem` (cached 1 h)
  - `PUT /:id` → `writeOrders` (admin)
  - `DELETE /:id` → `deleteOrders` (admin; soft delete unless `?hardDelete=true`)
  - `DELETE /:id/hard` → `deleteOrders` (admin; `routeFlag('hardDelete')` injects the flag)

## Relationships
- **`src/modules/orders/module.ts`** — imports and mounts the exported `router` into the application's route tree.
- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuth` (applied globally via `router.use`) and `isAdmin` (applied per-route to admin-only mutations).
- **`src/infrastructure/http/middlewares/cache.ts`** — `setCache` wraps read routes with a 1 h TTL keyed by the `orders` tag; `invalidateCache` is inserted before mutation handlers to bust the `orders` (and sometimes `products`) tag.
- **`src/infrastructure/http/middlewares/route-flag.ts`** — `routeFlag('hardDelete')` is used on the `/:id/hard` path to set the hard-delete flag programmatically instead of via query string.
- **Controllers** (`get-orders`, `write-orders`, `delete-orders`, `get-order-item`, `get-order-invoice`, `post-cancel-order`) — each is the terminal handler for one or more routes; `getOrders` is shared between the `/search` and `/` GET endpoints.

## Notes
- Route order is intentional: `/search`, `/:id/invoice`, and `/:id/cancel` are declared before the bare `/:id` so Express matches them first. Swapping them silently breaks those endpoints.
- `DELETE /` and `PUT /` expect the order id **in the request body**, whereas `/:id` variants take it from the path. Clients must use the correct shape.
- The cancel endpoint is the only write a non-admin customer may perform; authorization for it is enforced inside the service layer (conditional write scoped to the caller), not by an `isAdmin` middleware here.
- Cache tags are the string literals `'orders'` and `'products'`; any new mutation route must include the appropriate tag in `invalidateCache` to avoid serving stale data.
