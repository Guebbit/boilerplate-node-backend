# src/modules/delivery/routes.ts

## Purpose

Defines the Express route table for the delivery module, mapping three HTTP endpoints (shipping-methods lookup, per-order shipment read, courier advance tick) to their respective controllers with per-route authorization guards.

## Key elements

- **`router`** (exported) — The sole export; an Express `Router` instance with three mounted routes.
- **`GET /methods`** → `getShippingMethods` — Public endpoint; no auth middleware. Exposes available shipping options before purchase.
- **`GET /order/:orderId`** → `getShipmentByOrder` — Guarded by `getAuth` + `isAuth`. Returns the shipment tied to the caller's order.
- **`POST /advance`** → `postCourierAdvance` — Guarded by `getAuth` + `isAuth` + `isAdmin`. Simulates a courier status tick (an operator acts as the cron trigger).

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Source of the three middleware functions (`getAuth`, `isAuth`, `isAdmin`) applied per route.
- **`src/modules/delivery/controllers/get-shipping-methods.ts`** — Handler for the public `/methods` route.
- **`src/modules/delivery/controllers/get-shipment-by-order.ts`** — Handler for `/order/:orderId`.
- **`src/modules/delivery/controllers/post-courier-advance.ts`** — Handler for `/advance`.
- **`src/modules/delivery/module.ts`** — Consumes this router to mount delivery endpoints into the app.
- **`src/modules/delivery/tests/unit/routes.test.ts`** — Unit tests verifying route registration and guard ordering.
- **`tests/cross-cutting/authenticated-controllers.test.ts`** — Asserts that routes expecting a caller have the appropriate auth middleware.
- **`tests/cross-cutting/write-routes-are-guarded.test.ts`** — Asserts that write (POST) routes carry the necessary guards.

## Notes

- Authorization is **per-route**, not blanket. Only `/methods` is intentionally unauthenticated; the other two require authentication, and `/advance` additionally requires the admin role.
- `/advance` is a **simulated** courier tick, not a call to an external carrier API. The comment "an operator is the cron" makes clear it is triggered manually by staff, not by a scheduler.
- Route order in the file is load-bearing: the `:orderId` parameter route is placed before any potential catch-all to keep path matching unambiguous.
