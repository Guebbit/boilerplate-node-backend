---
source: src/modules/payments/order-routes.ts
sha256: 8d00915c982041d90ebfa0eec6ad2e5b294772f16c991fcd8104ca0ab3a2430d
generated_at: 2026-11-14T21:02:24.350466+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/order-routes.ts

## Purpose

Defines the two payment routes that live under the `/orders` URL namespace (`GET /orders/:id/payments` and `POST /orders/:id/payments`). The URL nests payments as a child of the order (Solidus-style), but the routes remain owned by the payments module and use the payments domain's `create:Payment` permission key. Mounted at `/orders` by `./module.ts`.

## Key elements

- **`orderRouter`** (exported) — the Express `Router` instance containing both routes; `module.ts` mounts it at `/orders`.
- **`GET /:id/payments`** — chain: `getAuth` → `isAuth` → `getOrderPayments`. Returns the order's payment (if one was started).
- **`POST /:id/payments`** — chain: `getAuth` → `isAuth` → `requirePermission('create', 'Payment')` → `idempotencyKey` → `postOrderPayment`. An operator records a payment the provider never saw.

## Relationships

- **`src/modules/payments/module.ts`** — imports and mounts `orderRouter` at the `/orders` path.
- **`src/modules/payments/controllers/get-order-payments.ts`** — terminal handler for the GET route.
- **`src/modules/payments/controllers/post-order-payment.ts`** — terminal handler for the POST route.
- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuth`, and `requirePermission` used on both routes.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — provides `idempotencyKey`, applied only to the POST route.
- **`src/modules/payments/tests/unit/routes.test.ts`** — unit-tests the route definitions and middleware chains.

## Notes

- The URL hierarchy places payments under `/orders`, but the module ownership and the `create:Payment` authorization key both belong to the **payments** domain. Don't move the permission key to an orders-scoped one.
- `idempotencyKey` is applied only to POST; the GET route has no idempotency protection (it is a read).
- The permission check uses the generated key `create:Payment` (sourced from `shared/authorization-keys.generated.yaml`), matching the same `stepUp` arrangement used by the refund route.
