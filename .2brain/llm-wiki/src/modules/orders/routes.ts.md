---
source: src/modules/orders/routes.ts
sha256: a0780f916832edc6807e829081faed47e7e0fa472672a319be251f2e0873e70e
generated_at: 2026-09-23T19:05:45.388806+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/routes.ts

## Purpose

Defines the Express router for all order-management HTTP endpoints. It wires authentication guards, permission checks, caching, idempotency, and rate-limiting middleware onto each route, and delegates handling to the module's controller functions.

## Key elements

- **`router`** (exported) — The `express.Router()` instance on which every order route is mounted.
- **`cacheOrdersSearch`** (module-local) — A `searchCache('orders', searchOrdersKeyParameters)` instance shared by `GET /` and `POST /search`.
- **Route guards** — `getAuth` + `isAuth` applied globally; `requirePermission('orders.any.*')` applied per admin route.
- **Controller handlers** — Thin one-line mounts: `getOrders`, `writeOrders`, `deleteOrders`, `getOrderItem`, `getOrderInvoice`, `postCancelOrder`, `postOrderStatusOverride`.
- **Cache middleware** — `setCache(3600, …)` on `GET /:id`; `invalidateCache(['orders', …])` on every mutating route; `searchCache` on the two list/search routes.
- **`idempotencyKey`** — Applied to `POST /` (admin order creation) so a retried request replays the same order.
- **`invoiceLimiter`** — Applied to `GET /:id/invoice` to throttle Chromium PDF renders.
- **`routeFlag('hardDelete')`** — Applied to `DELETE /:id/hard` to set the flag the controller expects.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Supplies `getAuth`, `isAuth`, and `requirePermission`; the router's global guard and per-route admin checks.
- **`src/modules/orders/controllers/*.ts`** (7 files) — Each exports the handler function that is the last argument of its `router.method(…)` call.
- **`src/infrastructure/http/middlewares/cache.ts`** — Supplies `searchCache`, `setCache`, and `invalidateCache` used across list, read, and mutation routes.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — Supplies `idempotencyKey`, used only on `POST /`.
- **`src/infrastructure/http/middlewares/route-flag.ts`** — Supplies `routeFlag`, used only on `DELETE /:id/hard`.
- **`src/modules/orders/rate-limits.ts`** — Supplies `invoiceLimiter`, used only on `GET /:id/invoice`.
- **`src/modules/orders/module.ts`** — Consumes the exported `router` to attach it to the application's route tree.
- **`src/modules/orders/tests/unit/routes.test.ts`** — Unit-tests the route table (paths, methods, middleware order, handler wiring).
- **`tests/support/routed-modules.ts`** — Test harness that mounts `router` into a supertest/express app for integration tests.

## Notes

- **Route order is load-bearing.** `/search`, `/:id/cancel`, `/:id/status-override`, `/:id/invoice`, and `/:id/hard` are declared *before* `GET /:id` so Express doesn't match them as an `:id` param. Reordering breaks routing.
- **Session-only auth is intentional.** The router uses `isAuth` (not `isAuthOrCredential`). An API-key credential would resolve to no `authContext`, causing `orderService.callerScope` to fall back to a wider scope and leak other tenants' orders. Opening the module to credential-based access requires splitting the router first.
- **`GET /:id/invoice` is deliberately uncached.** It renders a fresh PDF on every hit; caching raw bytes in the JSON cache would only ever store the first byte range Express flushed.
- **`POST /:id/cancel` is the only write a non-admin customer can perform.** All other mutations require an `orders.any.*` permission.
