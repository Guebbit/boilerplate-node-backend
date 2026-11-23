---
source: src/modules/orders/routes.ts
source_sha256: 33e598f847d2db9183db1cae663ed1db0fc8613bc3f2c197b8151e88b73af694
context_sha256: 050ff40ad3700e846b01f7fb74f0c802f3755bcd8aeaeabfbacd0e46f7b00d27
generated_at: 2026-11-22T06:17:57.379052+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/routes.ts

## Purpose
Express router for order management. Every route requires an authenticated session. A caller holding only `read:Order` sees only their own orders. The file also fixes route ordering, so that static segments (`/search`, `/export`) and longer paths (`/:id/hard`) are registered before `/:id` and not swallowed by it.

## Key elements
- `router` — the exported Express `Router`. It starts with `router.use(getAuth, isAuth)`. It uses `isAuth` rather than `isAuthOrCredential` on purpose: API-key credentials produce no `authContext`, which would silently widen the "my orders" scope.
- `isOperatorCancel(request)` — returns true when the caller holds `update:Order`. It is used with `requireFreshAuthWhen(..., 'critical')` so operator cancels need a fresh session. A customer's own cancel is never prompted.
- Routes:
  - `POST /search` → `getOrders` (`noStore`)
  - `GET /` → `getOrders` (`privateNoCache`)
  - `GET /export` → `getOrdersExport`. It needs `export:Order`, then `ordersExportLimiter`. The controller sets its own cache headers.
  - `POST /` → `createOrder`. It needs `create:Order` and runs `idempotencyKey` first.
  - `POST /:id/cancel` → `postCancelOrder`. This is the one write a customer can make.
  - `POST /:id/override-status` → `postOrderOverrideStatus`. It needs `override:Order`.
  - `PUT /:id/shipping-address` → `putShippingAddress`
  - `PUT /:id/billing-address` → `putBillingAddress`
  - `GET /:id/timeline` → `getOrderTimeline` (`privateNoCache`)
  - `POST /:id/timeline/notes` → `postOrderNote`. It runs `ordersNoteLimiter`, then `idempotencyKey`.
  - `DELETE /:id/timeline/notes/:eventId` → `deleteOrderNote`
  - `GET /:id` → `getOrderItem` (`privateNoCache`)
  - `PUT /:id` → `replaceOrderById`
  - `PATCH /:id` → `updateOrderById`
  - `DELETE /:id` → `deleteOrders` (soft delete unless `?hardDelete=true`)
  - `POST /:id/restore` → `restoreOrders`
  - `DELETE /:id/hard` → `deleteOrders`, preceded by `routeFlag('hardDelete')`
  - The address routes, note routes and `PUT`/`PATCH /:id` need `update:Order`. The delete and restore routes need `delete:Order`.

## Relationships
- `@kernel/middlewares/authorizations` supplies `getAuth`, `isAuth`, `requirePermission` and `requireFreshAuthWhen`.
- `@kernel/ability` (`holds`) and `@kernel/permissions` (`callerForSubject`) are used in `isOperatorCancel`.
- `@infrastructure/http/middlewares/cache` supplies `noStore` and `privateNoCache`.
- `@infrastructure/http/middlewares/idempotency` supplies `idempotencyKey`, used on order creation and note posting.
- `@infrastructure/http/middlewares/route-flag` supplies `routeFlag('hardDelete')` for `/:id/hard`.
- `./controllers/*` hold the handlers: `get-orders`, `get-order`, `get-orders-export`, `get-order-timeline`, `order-notes`, `post-cancel-order`, `post-order-override-status`, `post-order-restore`, `delete-orders`, plus the create/update/address controllers.
- `./rate-limits` provides `ordersExportLimiter` and `ordersNoteLimiter`.
- The `invoicing` module mounts its own router at the same `/orders` basePath. It owns `GET /orders/{id}/invoice` and `/credit-note`, so those are not defined here. The mount order does not matter, because `/:id` matches only one path segment.

## Notes
- Route order is load-bearing. Moving `/search`, `/export`, `/:id/...` or `/:id/hard` below the matching `/:id` route breaks them. For example, `requireId` would answer 404 for `export`.
- Middleware order within a route is deliberate:
  - Permission check, then rate limit, then idempotency on notes, so a replayed note still counts against the budget.
  - `idempotencyKey` first on order creation, so a retry replays the same order.
  - The fresh-auth check on cancel runs before anything else.
- Order reads and the timeline are never Redis-cached, because the response depends on the caller. The search `POST` uses `noStore`, and the `GET` routes use `privateNoCache`.
- Opening this router to API-key credentials would require splitting it first.
