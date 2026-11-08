---
source: src/modules/payments/services/view.ts
sha256: e8b7809294b56c92aff8d64c902e9606cacb1847b77c4d2ac7450d7d20ecfa3e
generated_at: 2026-11-08T07:30:21.073005+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/view.ts

## Purpose

Read-only (GET) views for payments: fetch a payment by order, by id, or its refunds, and attach the `actions` block that tells the caller which follow-up mutations (pay, sync, refund, settleByHand, cancelRefund) are available to them. The `actions` shape intentionally mirrors the one `orders` publishes on `OrderActions`.

## Key elements

- **`getForOrder(orderId, authContext)`** — Returns the single payment behind an order (for the order-page panel), or a 404.
- **`listForOrder(orderId, authContext)`** — Returns the order's payment as a zero- or one-element list (`{ items }`). Reads the order first so an invisible order yields 404 before the payment is looked up.
- **`getById(paymentId, authContext)`** — Fetches one payment by its own id (the `Location` target after `POST /payments`).
- **`getRefund(paymentId, refundId, authContext)`** — Retrieves a specific refund record nested under a payment.
- **`refundOf(payment, refundId, authContext)`** — Finds a refund by id on an already-loaded `PaymentDocument`; exported so write-endpoint handlers can return the exact record they just created.
- **`withActions(payment, order, authContext)`** — Core serializer: spreads `presentPayment` output and appends the computed `actions` flags.
- **`presentWithActions(payment, authContext)`** — Convenience wrapper that reads the order (needed for `pay`) before calling `withActions`; used in write-response paths.
- **`isPayerWithCheckout` / `mayRefund` / `mayPay` / `maySync` / `settleableByHand` / `cancelableRefunds`** — Private predicates that gate each individual action flag on status, role, and provider availability.

## Relationships

- **`@infrastructure/http/response`** — Wraps every result in `generateSuccess` / `generateReject`; response types `ResponseSuccess` / `ResponseReject` form the return contract.
- **`@infrastructure/i18n`** — `t('orders.not-found')` for the 404 message in `listForOrder`.
- **`@kernel/ability` (`holds`)** and **`@kernel/permissions` (`callerForSubject`)** — Permission evaluation for `checkout:Cart` (payer) and `create:Refund` (staff).
- **`@modules/orders` (`orderService`, `isPayable`)** — `listForOrder` and `presentWithActions` read the order through `orderService` to enforce order-level visibility and to pass the order status into `mayPay`.
- **`@modules/payments/domain`** — Status constants (`CONFIRMABLE_PAYMENT_STATUSES`, `IN_FLIGHT_PAYMENT_STATUSES`, `REFUNDABLE_PAYMENT_STATUS`) and helpers (`hasOpenChargeback`, `isHandRecorded`, `isOpenTransfer`, `mayBeSettledByHand`, `mayBeCanceled`) drive every action predicate.
- **`@modules/payments/presenter` (`presentPayment`)** — Serializes the `PaymentDocument` into the wire `Payment` shape before `actions` are attached.
- **`@modules/payments/providers` (`resolvePaymentProvider`)** — `mayPay` requires a resolved provider when taking over an open transfer with a card.
- **`./scope` (`callerScope`, `readsAllPayments`)** — Scopes repository queries to the caller and gates staff-only fields in the presenter.
- **`./refund-settlement` (`remainingOf`)** — `actions.refund` is only true when unrefunded amount > 0.

## Notes

- **Identical 404 for "not found" and "not yours."** `getById` / `getForOrder` / `getRefund` return the same `paymentNotFound()` regardless of whether the record is missing or belongs to another caller — intentional to avoid leaking existence.
- **`mayPay` and `maySync` are mutually exclusive by design.** `maySync` is narrower than the `POST /payments/:id/sync` route (which also accepts confirmable/declined statuses); the two flags never both return `true`.
- **`listForOrder` checks order visibility before payment visibility**, while `getForOrder` does not — a caller with `display:Payment` but no order access gets 404 from the repository scope in the former, but in the latter the payment-scope check alone produces the 404.
- **`refundOf` is exported** (not just internal) so that write-service handlers can return the specific refund they just wrote without re-querying, avoiding a race where a concurrent request added a newer refund.
