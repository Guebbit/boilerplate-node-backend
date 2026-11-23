---
source: src/modules/payments/order-routes.ts
source_sha256: d221b474eb0a9f91555fd492ec5f4a81df835461294a02dc31cc9ecb8c9426de
context_sha256: 0d1e9bb00e2a4f19dd1f5016acb67bf49e8d5233f8df330e806e69451ef9d3b1
generated_at: 2026-11-22T06:46:49.359822+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/order-routes.ts

## Purpose
Defines the Express router for payment endpoints nested under an order: reading the order's payment and letting an operator manually record a payment the provider never saw. The payment is a child of the order in the URL, while the module and its `create:Payment` permission key remain payments'. The router is mounted at `/orders` by `./module.ts`.

## Key elements
- `orderRouter` — exported Express `Router` holding both routes.
- `GET /:id/payments` — middleware `getAuth`, `isAuth`, then `getOrderPayments`. Returns the order's payment, if one was started; the service scopes it.
- `POST /:id/payments` — middleware `getAuth`, `isAuth`, `requirePermission('create', 'Payment')`, `idempotencyKey`, then `postOrderPayment`. Used by an admin recording money by hand.

## Relationships
- `src/kernel/middlewares/authorizations.ts` — provides `getAuth`, `isAuth` and `requirePermission`, applied to both routes (the permission check only on POST).
- `src/infrastructure/http/middlewares/idempotency.ts` — provides `idempotencyKey`, applied only to POST.
- `src/modules/payments/controllers/get-order-payments.ts` — handler for the GET route.
- `src/modules/payments/controllers/post-order-payment.ts` — handler for the POST route.
- `src/modules/payments/module.ts` — mounts `orderRouter` at `/orders`.
- `src/modules/payments/tests/unit/routes.test.ts` — unit tests for the payments routes.

## Notes
- The POST route has the same `stepUp` arrangement as the refund; the `create:Payment` key carries it in `shared/authorization-keys.generated.yaml`.
- Middleware order on POST matters: authentication, then permission check, then idempotency key, then the controller.
- GET only requires an authenticated user, with no explicit permission check in the route; scoping is left to the service.
