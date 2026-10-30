---
source: src/modules/payments/services/view.ts
sha256: 1870827ff90568f661e13bcaabb5c6613504103a282d642b4d8a12f44992dc2c
generated_at: 2026-10-29T05:14:40.151478+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/view.ts

## Purpose

Read-layer for the payment domain. Serves the order page's payment panel and the standalone `GET /payments/:id` surface, always attaching a computed `actions` block (the same shape `orders` publishes as `OrderActions`) so the caller knows exactly which next-step endpoints are open to them.

## Key elements

- **`getForOrder(orderId, authContext)`** — Looks up the payment row for an order (scoped to the caller) and returns it with `actions`. Returns `paymentNotFound()` (404) when absent.
- **`listForOrder(orderId, authContext)`** — `GET /orders/{id}/payments`. Reads the order first (so a caller who cannot see the order gets 404 before any payment lookup), then returns `[{ payment + actions }]` or `[]`.
- **`getById(paymentId, authContext)`** — Fetches a payment by its own id (scoped) and returns it with `actions`.
- **`getRefund(paymentId, refundId, authContext)`** — Returns a single refund record addressed through its parent payment; 404 covers missing payment, missing refund, or another user's payment.
- **`refundOf(payment, refundId, authContext)`** — Given an already-loaded `PaymentDocument`, finds and returns one refund by id. Used by write services that just created a refund and must return *that* record, not whichever is newest.
- **`withActions(payment, order, authContext)`** — Core combinator: spreads `presentPayment(...)` and appends the `actions` object (`pay`, `sync`, `refund`, `settleByHand`, `cancelRefund`).
- **`presentWithActions(payment, authContext)`** — Reads the order via `orderService.getById` (needed for the `pay` check) then delegates to `withActions`.
- **Private predicates** — `isPayerWithCheckout`, `mayRefund`, `mayPay`, `maySync`, `settleableByHand`, `cancelableRefunds`: the individual permission + state checks that feed each `actions` flag.

## Relationships

- **`@infrastructure/http/response`** — Wraps every result in `generateSuccess` / `generateReject`.
- **`@infrastructure/i18n`** — `t('orders.not-found')` for the 404 message in `listForOrder`.
- **`@kernel/ability` / `@kernel/permissions`** — `holds(callerForSubject(...), verb, subject)` drives every permission gate (`checkout:Cart`, `create:Refund`).
- **`@modules/orders`** — `orderService.getForCaller` / `orderService.getById` (order-level access check and the order read for `mayPay`); `isPayable` (lifecycle predicate); `OrderDocument` type.
- **`../domain`** — Status constants (`CONFIRMABLE_PAYMENT_STATUSES`, `IN_FLIGHT_PAYMENT_STATUSES`, `REFUNDABLE_PAYMENT_STATUS`) and predicates (`hasOpenChargeback`, `isHandRecorded`, `isOpenTransfer`, `mayBeSettledByHand`, `mayBeCanceled`).
- **`../providers`** — `resolvePaymentProvider()` to confirm a provider exists before offering `mayPay` on an open transfer.
- **`../presenter`** — `presentPayment` serialises the document and applies staff-only visibility via `readsAllPayments`.
- **`./scope`** — `callerScope` (repository-level scoping) and `readsAllPayments` (presenter-level field gating).
- **`./refund-settlement`** — `remainingOf` to confirm there is still money eligible for refund.
- **`./errors`** — `paymentNotFound()` shared 404 helper.

## Notes

- `mayPay` and `maySync` are **mutually exclusive by construction**: `maySync` requires `IN_FLIGHT_PAYMENT_STATUSES`, while `mayPay` requires `CONFIRMABLE_PAYMENT_STATUSES` (or an open transfer). They never co-occur, so the UI can treat them as disjoint next-steps.
- `listForOrder` intentionally reads the order *before* the payment so that a caller without access to the order receives 404 regardless of whether a payment row exists.
- `presentWithActions` performs an extra `orderService.getById` read solely to evaluate `pay`; `getForOrder` and `getById` both route through it. `listForOrder` avoids that extra read because it already has the order document.
- `refundOf` exists because a racing concurrent write could make "last element of `refunds`" point to a different record; callers that just wrote a refund must address it by id.
- Scoping model: the repository call is filtered by `callerScope(authContext)` (ownership or admin), while `readsAllPayments(authContext)` controls which *fields* are visible to non-staff callers in the presenter.
