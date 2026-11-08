---
source: src/modules/payments/order-routes.ts
sha256: ccb222b862a4f0182cf7350e2d4ceb28eb2e852a8920247ed1d092965c4a7409
generated_at: 2026-11-08T07:22:47.229824+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/order-routes.ts

## Purpose

Express router that wires the two payment routes living under an order path (`GET /orders/:id/payments` and `POST /orders/:id/payments`). It exists so that payment operations scoped to a specific order can be mounted as a sub-router by the payments module, keeping URL hierarchy (Solidus-style nested resource) separate from the module's top-level payment routes.

## Key elements

- **`orderRouter`** — the sole export; an Express `Router` instance carrying exactly two route definitions.
- **GET `/:id/payments`** — reads the order's payment (if one was started). Middleware chain: `getAuth` → `isAuth` → `getOrderPayments` controller.
- **POST `/:id/payments`** — an operator manually recording money the provider never saw. Middleware chain: `getAuth` → `isAuth` → `requirePermission('create', 'Payment')` → `idempotencyKey` → `postOrderPayment` controller.

## Relationships

- **`src/modules/payments/module.ts`** — mounts `orderRouter` at the `/orders` path, making this file a sub-router of the payments module.
- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuth`, and `requirePermission` used as middleware on both routes.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — supplies the `idempotencyKey` middleware applied to the POST route to guard against duplicate payment records.
- **`src/modules/payments/controllers/get-order-payments.ts`** — handler for the GET route; performs the actual read.
- **`src/modules/payments/controllers/post-order-payment.ts`** — handler for the POST route; performs the manual payment creation.
- **`src/modules/payments/tests/unit/routes.test.ts`** — unit-tests the route definitions and middleware ordering in this file.

## Notes

- The permission key is `'create:Payment'`, stored in `shared/authorization-keys.yaml`. The file's JSDoc flags that this mirrors the refund's `stepUp` arrangement — the authorization lives under the payments module even though the URL is nested under `/orders`.
- The GET route has **no** `requirePermission` and **no** `idempotencyKey`; only the POST route carries those. Don't add them to GET.
- The file intentionally does **not** import or reference the order module; the `:id` param is opaque here and scoped by the controller.
