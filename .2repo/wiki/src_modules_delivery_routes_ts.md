# src/modules/delivery/routes.ts

## Purpose

Defines the Express router for the delivery module, wiring URL paths to their respective controller handlers and applying the appropriate authentication/authorization middleware for each route. It is the single entry point that the module mounts to expose delivery endpoints.

## Key elements

- **`router`** (exported `express.Router`) — the only export; contains three route registrations:
  - `GET /methods` → `getShippingMethods` — public; no auth middleware.
  - `GET /order/:orderId` → `getShipmentByOrder` — protected; requires `getAuth` + `isAuth`.
  - `POST /advance` → `postCourierAdvance` — protected; requires `getAuth` + `isAuth` + `isAdmin`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies the `getAuth`, `isAuth`, and `isAdmin` middlewares applied per-route before the controller executes.
- **`src/modules/delivery/controllers/get-shipping-methods.ts`** — handler for `GET /methods`.
- **`src/modules/delivery/controllers/get-shipment-by-order.ts`** — handler for `GET /order/:orderId`.
- **`src/modules/delivery/controllers/post-courier-advance.ts`** — handler for `POST /advance`.
- **`src/modules/delivery/module.ts`** — imports and mounts `router` to expose these paths on the application.

## Notes

- The `POST /advance` route is described in the inline comment as "the fake courier's tick; an operator is the cron," implying it is an internal/admin action simulating a time-based delivery step rather than a user-facing mutation.
- Only the `/methods` route is publicly accessible; all other delivery operations require at least authenticated caller identity, and the advance tick additionally requires the `isAdmin` role.
