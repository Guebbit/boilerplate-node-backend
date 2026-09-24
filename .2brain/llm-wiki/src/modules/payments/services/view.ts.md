---
source: src/modules/payments/services/view.ts
sha256: 3ad25f9ba3fc0bde23efb4acd36ae7fa09e7c551d366b3f72e3adb95d5cea52f
generated_at: 2026-09-23T19:22:39.327542+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/view.ts

## Purpose

Read-side service for the order page's payment panel: loads a payment for a given order (scoped to the caller) and attaches the `actions` object (`pay`, `refund`) that tells the client what it may do. The actions mirror the `OrderActions` contract so the order page can render one consistent action model across its panels.

## Key elements

- **`getForOrder(orderId, authContext?)`** — Looks up the payment via `paymentRepository.findByOrderId` with `callerScope`. On a miss, returns a 404 reject with an i18n message. On a hit, reads the order (via `orderService.getById`) solely to evaluate payability, then returns `withActions(payment, order, authContext)`.
- **`withActions(payment, order, authContext?)`** — Spreads `payment.toJSON()` (document → wire transform: `_id`→`id`, dates→ISO) and computes the `actions` object:
    - `pay` — `true` when the payment status is in `CONFIRMABLE_PAYMENT_STATUSES` **and** the order still satisfies `isPayable`. In-flight payments are deliberately excluded.
    - `refund` — `true` when the caller's ability subject holds the `payments.any.update` key **and** the payment is in `REFUNDABLE_PAYMENT_STATUS`.

## Relationships

- **`../repository`** — `paymentRepository.findByOrderId` is the sole data-fetch call.
- **`../model`** — `PaymentDocument` type (stored shape) passed into `withActions`.
- **`./scope`** — `callerScope(authContext)` restricts the repository query to the caller's own payments.
- **`./settlement`** — `CONFIRMABLE_PAYMENT_STATUSES` gates the `pay` action.
- **`./refunds`** — `REFUNDABLE_PAYMENT_STATUS` gates the `refund` action.
- **`@modules/orders`** — `orderService.getById` fetches the order for the `pay` check; `isPayable` evaluates order-status eligibility.
- **`@kernel/permissions`** — `callerForSubject` resolves the caller's ability subject for the refund permission check.
- **`@kernel/ability`** — `holdsKey` tests whether that subject carries `payments.any.update`.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape the HTTP response.
- **`@infrastructure/i18n`** — `t` localises the 404 message.

## Notes

- `withActions` is a standalone export; callers can reuse it without going through `getForOrder`.
- The `order` parameter is typed `OrderDocument | Order | undefined` because `orderService.getById` returns a hydrated document for admins but the wire-shaped `Order` for owners. Only `.status` is read, which exists on both.
- `payment.toJSON()` is required inside `withActions` to convert the stored document (Mongoose-style `_id`, `Date` fields) into the `Payment` wire shape. Spreading without it would leak internal field names.
- The refund permission check uses the narrow key `payments.any.update` (the exact key a moderator holds) rather than a broader role-based check; widening the key would have hidden the action from moderators.
