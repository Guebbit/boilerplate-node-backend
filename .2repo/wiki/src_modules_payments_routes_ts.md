# src/modules/payments/routes.ts

## Purpose

Express router that defines the four payment endpoints (intent, confirm, read-by-order, refund) and enforces the authentication/authorization boundary for all of them. It exists so the module's public surface is a single `router` export that `module.ts` can mount, while keeping auth policy in one visible place.

## Key elements

- **`router`** (exported `Router`) — the sole export; all other identifiers are route registrations or imports.
- **`router.use(getAuth, isAuth)`** — applies authentication to every subsequent route; no payment endpoint is reachable anonymously.
- **`POST /intent`** → `postPaymentIntent` — freezes an order's price for later confirmation.
- **`GET /order/:orderId`** → `getPaymentByOrder` — read-only lookup of the payment behind an order.
- **`POST /order/:orderId/refund`** → `postPaymentRefund`, additionally guarded by `isAdmin` — operator-only money return.
- **`POST /:id/confirm`** → `postPaymentConfirm` — card-dialog submit that finalises a payment.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — source of the three middleware functions (`getAuth`, `isAuth`, `isAdmin`) consumed on every route.
- **`src/modules/payments/controllers/post-payment-intent.ts`**, **`post-payment-confirm.ts`**, **`get-payment-by-order.ts`**, **`post-payment-refund.ts`** — the four handler functions wired to their respective routes.
- **`src/modules/payments/module.ts`** — mounts this `router` into the application's payment route tree.
- **`src/modules/payments/tests/unit/routes.test.ts`** — unit tests that assert route shape and middleware ordering.
- **`tests/cross-cutting/authenticated-controllers.test.ts`** — verifies that every controller registered here sits behind `isAuth`.
- **`tests/cross-cutting/write-routes-are-guarded.test.ts`** — verifies that all `POST` routes here are guarded (auth, and `isAdmin` where applicable).

## Notes

- The `isAdmin` guard is applied **per-route** (only on `/order/:orderId/refund`), not at the router level. The other three routes are auth-only. The file's header comment frames this as an intentional split: a refund left open to any authenticated caller would be a self-service withdrawal, while locking intent/confirm to admins would make checkout impossible.
- Route ordering matters: `GET /order/:orderId` and `POST /order/:orderId/refund` are registered before the catch-all `POST /:id/confirm` so that Express doesn't misroute a refund as a confirm.
