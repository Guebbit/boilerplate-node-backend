# src/modules/payments/routes.ts

## Purpose
Defines the Express router that wires all HTTP payment endpoints (intent creation, confirmation, lookup by order, and refund) to their respective controllers, with authentication enforced at the router level.

## Key elements
- **`router`** (exported) — The Express `Router` instance. All payment module routes hang off this object.
- **`router.use(getAuth, isAuth)`** — Applies the two auth middlewares to every route on this router before any handler runs.
- **`POST /intent`** → `postPaymentIntent` — Freezes an order's price in preparation for card confirmation.
- **`GET /order/:orderId`** → `getPaymentByOrder` — Retrieves the payment record associated with a given order.
- **`POST /order/:orderId/refund`** → `isAdmin` → `postPaymentRefund` — Operator-initiated refund; the order itself is left unchanged.
- **`POST /:id/confirm`** → `postPaymentConfirm` — Submits the Stripe card dialog (confirms the payment intent).

## Relationships
- **`src/kernel/middlewares/authorizations.ts`** — Supplies the three middleware functions (`getAuth`, `isAuth`, `isAdmin`) that gate access to these routes.
- **`src/modules/payments/controllers/post-payment-intent.ts`** — Handler for `POST /intent`.
- **`src/modules/payments/controllers/post-payment-confirm.ts`** — Handler for `POST /:id/confirm`.
- **`src/modules/payments/controllers/get-payment-by-order.ts`** — Handler for `GET /order/:orderId`.
- **`src/modules/payments/controllers/post-payment-refund.ts`** — Handler for `POST /order/:orderId/refund`.
- **`src/modules/payments/module.ts`** — The module entry point that imports and mounts this `router` into the broader application.

## Notes
- The refund route is the **only** one that adds a second gate (`isAdmin`) on top of the router-wide auth. All other payment routes require only a standard authenticated user.
- The confirm route parameterises by **payment id** (`/:id/confirm`), not by order id. Callers must already possess the payment intent id returned by `POST /intent`.
- Route ordering matters for Express: the more specific `/order/:orderId` and `/order/:orderId/refund` paths are registered **before** the wildcard `/:id/confirm`, avoiding an accidental match.
