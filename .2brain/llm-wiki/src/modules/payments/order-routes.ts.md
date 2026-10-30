---
source: src/modules/payments/order-routes.ts
sha256: ccb222b862a4f0182cf7350e2d4ceb28eb2e852a8920247ed1d092965c4a7409
generated_at: 2026-10-29T05:07:33.061356+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/order-routes.ts

## Purpose
Express router that exposes the two payment operations nested under an order's URL (`/orders/:id/payments`). It exists to keep the URL hierarchy order-first (matching the Solidus convention) while the domain logic and authorization keys remain in the payments module.

## Key elements
- **`orderRouter`** (exported) — An Express `Router` instance with two routes:
  - `GET /:id/payments` — returns the order's payment (if one was started). Middleware: `getAuth` → `isAuth` → `getOrderPayments`.
  - `POST /:id/payments` — records a payment by hand (operator-initiated). Middleware: `getAuth` → `isAuth` → `requirePermission('create', 'Payment')` → `idempotencyKey` → `postOrderPayment`.

## Relationships
- **`src/modules/payments/module.ts`** — imports `orderRouter` and mounts it at the `/orders` path.
- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuth`, and `requirePermission`, which guard both routes.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — supplies the `idempotencyKey` middleware applied to the POST route.
- **`src/modules/payments/controllers/get-order-payments.ts`** — terminal handler for the GET route.
- **`src/modules/payments/controllers/post-order-payment.ts`** — terminal handler for the POST route.
- **`src/modules/payments/tests/unit/routes.test.ts`** — unit-tests the route definitions and middleware ordering of this router.

## Notes
- The URL is order-scoped (`/orders/:id/payments`), but the authorization key is `create:Payment` (payments module), not an order key. The comment calls this a deliberate "stepUp" arrangement; the step-up flag is defined in `shared/authorization-keys.yaml`.
- `idempotencyKey` is applied only to POST. The GET route relies on its natural idempotency and carries no idempotency middleware.
- The router is intentionally thin: it contains no business logic, only middleware wiring and path declarations. All domain work lives in the two controllers.
