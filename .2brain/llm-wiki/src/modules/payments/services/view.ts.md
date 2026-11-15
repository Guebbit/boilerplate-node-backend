---
source: src/modules/payments/services/view.ts
sha256: 671a2d247dafa272cc118e30616475cd3e6700c0f1f1141978aca393bc01d815
generated_at: 2026-11-14T21:10:21.789018+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/view.ts

## Purpose

Read-side service that returns a payment (or its refund records) to the caller with a computed `actions` object describing what that caller may do next (pay, sync, refund, settle, cancel). It is the source of the payment panel on the order page and the payload of `GET /payments/:id`–style routes, mirroring the `OrderActions` pattern the orders module uses.

## Key elements

- **`getForOrder(orderId, authContext)`** — Fetches the single payment for an order, scoped to the caller, and returns it with `actions`. 404 if no payment exists.
- **`listForOrder(orderId, authContext)`** — Reads the order first (for authorization), then returns `{ items: Payment[] }` (0 or 1 element). Used by `GET /orders/:id/payments`.
- **`orderIdOf(paymentId)`** — Unscoped lookup of the order id behind a payment; used by system notices that must name the order regardless of the reader's scope.
- **`getById(paymentId, authContext)`** — Fetches a single payment by its own id with `actions`.
- **`getRefund(paymentId, refundId, authContext)`** — Returns one refund record nested under a payment; single 404 for any miss.
- **`refundOf(payment, refundId, authContext)`** — Synchronous helper for write services that already hold the `PaymentDocument`; finds a refund by id in the presented shape.
- **`withActions(payment, order?, authContext)`** — Serializes the document via `presentPayment` and attaches the `actions` object. The core computation lives in the private helpers below.
- **`presentWithActions(payment, authContext)`** — Wraps `withActions` and performs an additional order read (via `orderService`) so the `pay` flag can be evaluated.
- **`mayPay`** *(private)* — True when the payment is confirmable (or an open transfer with a resolvable provider), the order is still `isPayable`, and the caller is the payer holding `checkout:Cart`.
- **`maySync`** *(private)* — True when the payment is in an in-flight status, not hand-recorded, and the caller is the payer. Deliberately narrower than `mayPay` so the two flags are never both true.
- **`mayRefund`** *(private)* — Checks the caller holds `create:Refund` on the `Payment` subject.
- **`settleableByHand` / `cancelableRefunds`** *(private)* — Return the list of refund ids an operator may settle or void, filtered through `mayBeSettledByHand` / `mayBeCanceled`.
- **`isPayerWithCheckout`** *(private)* — Combines identity match (`payment.userId === authContext.id`) with the `checkout:Cart` ability check.

## Relationships

- **`src/infrastructure/http/response.ts`** — Wraps results in `generateSuccess` / `generateReject` envelopes.
- **`src/infrastructure/i18n/index.ts`** — Provides `t()` for localizing the 404 message string.
- **`src/infrastructure/i18n/context.ts`** — I18n context infrastructure backing the `t` call.
- **`src/kernel/ability.ts`** — `holds()` evaluates permission keys (`checkout:Cart`, `create:Refund`).
- **`src/kernel/permissions.ts`** — `callerForSubject()` resolves the caller's ability context for a given subject type.
- **`src/modules/orders/index.ts`** — Exports `orderService` (used for authorization reads in `listForOrder` and for the order lookup in `presentWithActions`) and `isPayable` (gates whether the order can still reach `paid`).
- **`src/modules/orders/model.ts`** — Source of the `OrderDocument` type used in `withActions` and the `mayPay` helper.
- **`src/modules/orders/services/index.ts`** — Implementation behind `orderService` that `listForOrder` and `presentWithActions` call.
- **`src/modules/orders/domain/lifecycle.ts`** — Domain logic (e.g. `isPayable`) that determines whether an order can still transition to `paid`.
- **`src/modules/payments/domain/index.ts`** — Re-exports status sets and predicates consumed by the action helpers.
- **`src/modules/payments/domain/lifecycle.ts`** — Defines `CONFIRMABLE_PAYMENT_STATUSES`, `IN_FLIGHT_PAYMENT_STATUSES`, `REFUNDABLE_PAYMENT_STATUS`, and status-related predicates.
- **`src/modules/payments/domain/disputes.ts`** — Provides `hasOpenChargeback` used to gate the `refund` action.
- **`src/modules/payments/model.ts`** — `PaymentDocument` type for the repository row.
- **`src/modules/payments/presenter.ts`** — `presentPayment` serializes a `PaymentDocument` to the wire `Payment` shape (including staff-only fields gated by `readsAllPayments`).
- **`src/modules/payments/providers/index.ts`** — `resolvePaymentProvider()` is checked to decide whether an open transfer can be taken over with a card.

## Notes

- `mayPay` and `maySync` are designed to be mutually exclusive: in-flight statuses yield `sync`, confirmable/declined statuses yield `pay`. A consumer should never see both `true`.
- The `refund` action requires three independent gates beyond `mayRefund`: status must be `REFUNDABLE_PAYMENT_STATUS`, `remainingOf(payment) > 0`, and no open chargeback (`hasOpenChargeback`). A status-only check is insufficient.
- `orderIdOf` intentionally omits caller scoping; it exists for system-generated notices (e.g., refund-unknown staff alert) that must name the order regardless of who is reading.
- `presentWithActions` performs an extra order read solely to evaluate `pay`. When the order is irrelevant (e.g., a succeeded payment), callers can invoke `withActions` directly with `order = undefined` to skip that read.
- The `actions` shape intentionally mirrors `OrderActions` from the orders module so the UI can treat both uniformly.
