---
source: src/modules/payments/services/view.ts
sha256: 04b3fc21569d2c99654a4d289f18f7d3541a3bc965d84c931ddff69721d25e0e
generated_at: 2026-09-27T15:27:57.384786+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/view.ts

## Purpose

Read-side service for payments: retrieves the payment linked to an order and enriches it with the set of actions (`pay`, `refund`) the caller is permitted to take. This is the data contract behind the order page's payment panel, mirroring the `OrderActions` shape the orders module publishes.

## Key elements

- **`getForOrder(orderId, authContext?)`** — Looks up a payment by order ID (scoped via `callerScope`), returns a 404 reject if absent, then fetches the order and returns a success response with the payment decorated by `withActions`.
- **`withActions(payment, order?, authContext?)`** — Spreads `payment.toJSON()` (which applies the model's `_id → id` / date-to-ISO transform) and attaches an `actions` object:
  - `pay` — true when the payment status is in `CONFIRMABLE_PAYMENT_STATUSES` **and** the order's status is payable per `isPayable`. In-flight (sync-pending) payments are deliberately excluded.
  - `refund` — true when the caller holds the `payments.any.update` ability key (checked via `holdsKey` on the `Payment` subject) **and** the payment is in `REFUNDABLE_PAYMENT_STATUS`.

## Relationships

- **`./scope` → `callerScope`** — determines whether the caller sees only their own payment or can see any (admin).
- **`../model` → `CONFIRMABLE_PAYMENT_STATUSES`** — the set of payment statuses that allow a `pay` action.
- **`./refunds` → `REFUNDABLE_PAYMENT_STATUS`** — the single status that gates the `refund` action.
- **`@modules/orders` (`orderService`, `isPayable`)** — provides order lookup and the order-side half of the payability check.
- **`@kernel/ability` / `@kernel/permissions`** — `holdsKey` and `callerForSubject` resolve whether the caller's subject holds the `payments.any.update` key.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` wrap results in the standard HTTP response shape.
- **`@infrastructure/i18n`** — `t('payments.not-found')` localises the 404 message.
- **`../repository`** — `paymentRepository.findByOrderId` is the data-access call.
- **`./index.ts`** — re-exports both functions as the public surface of the payments services.
- **`../tests/integration/service.test.ts`** — integration tests exercise these exports end-to-end.

## Notes

- `withActions` is exported separately so other payment services (e.g. `refunds.ts`) can reuse the same action-computation logic without re-fetching.
- The `pay` flag intentionally excludes in-flight payments to prevent a customer from submitting a second payment method before `sync` resolves.
- The refund check uses the exact key `payments.any.update` rather than a broader role check; a moderator holding only that key will see the action, while a broader `payments.any.*` match would have hidden it (see comment in source).
