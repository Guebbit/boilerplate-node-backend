# src/modules/payments/routes.ts

## Purpose
Defines the Express route table for all payment endpoints (intent creation, confirmation, order lookup, refund). Enforces a layered auth model at the router level: every route requires authentication, all money-moving routes additionally require a fresh re-authentication session, and the refund route is admin-only.

## Key elements
- **`router`** (exported `Router`) — the single exported value; mounted by the payments module.
- **Router-level middleware** (`getAuth`, `isAuth`) — applied via `router.use`, so every route is authenticated.
- **`POST /intent`** — creates a payment intent; guarded by `requireFreshAuth(REAUTH_TIME_CRITICAL)` → `postPaymentIntent`.
- **`GET /order/:orderId`** — reads back the payment for an order; auth only, no fresh-session requirement (read-only) → `getPaymentByOrder`.
- **`POST /order/:orderId/refund`** — admin-only refund; middleware order is `isAdmin` *then* `requireFreshAuth(REAUTH_TIME_CRITICAL)` → `postPaymentRefund`.
- **`POST /:id/confirm`** — confirms a previously created intent; guarded by `requireFreshAuth(REAUTH_TIME_CRITICAL)` → `postPaymentConfirm`.

## Relationships
- **`src/kernel/middlewares/authorizations.ts`** — supplies all five auth primitives (`getAuth`, `isAuth`, `isAdmin`, `requireFreshAuth`, `REAUTH_TIME_CRITICAL`) consumed by this file.
- **`src/modules/payments/controllers/post-payment-intent.ts`** — handler for `POST /intent`.
- **`src/modules/payments/controllers/post-payment-confirm.ts`** — handler for `POST /:id/confirm`.
- **`src/modules/payments/controllers/get-payment-by-order.ts`** — handler for `GET /order/:orderId`.
- **`src/modules/payments/controllers/post-payment-refund.ts`** — handler for `POST /order/:orderId/refund`.
- **`src/modules/payments/module.ts`** — mounts `router` into the application (the consuming module).
- **`src/modules/payments/tests/unit/routes.test.ts`** — unit tests exercising route definitions and middleware order.
- **`tests/cross-cutting/authenticated-controllers.test.ts`** — verifies every route is behind auth.
- **`tests/cross-cutting/step-up-auth-routes.test.ts`** — verifies money-moving routes carry `requireFreshAuth`.
- **`tests/cross-cutting/write-routes-are-guarded.test.ts`** — verifies all `POST` routes have appropriate guards.

## Notes
- Middleware order on the refund route is deliberate: `isAdmin` runs *before* `requireFreshAuth`. The comment in the file states an admin session moving money out is "worth more, not less," so both gates must pass and the admin check is the cheaper, earlier one.
- `GET /order/:orderId` is the **only** route without `requireFreshAuth`; it is read-only and does not move money.
- The file exports a single value (`router`); there are no named function exports.
- Route param naming is intentionally inconsistent (`:id` vs `:orderId`) to reflect that `/confirm` operates on the payment identifier while the other two operate on the order identifier.
