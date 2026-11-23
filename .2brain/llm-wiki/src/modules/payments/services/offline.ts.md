---
source: src/modules/payments/services/offline.ts
source_sha256: 7ce20bfe2eed7b2c208bae204db36910d67252db8a379d084aad007dc46ff46b
context_sha256: 03d9f6071e031f81e34e91b16d5895f64d0e61d58adbc7004ac2446984021535
generated_at: 2026-11-22T06:51:55.587186+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/offline.ts

## Purpose
Records payments that never passed through the payment provider, such as cash at the counter or a phone order paid by transfer. It writes the payment row and then passes it to `settlePayment`, the same settlement path card payments use. The order moves `pending → paid`, stock commits, and the usual `ORDER_STATUS_CHANGED` and `PAYMENT_SUCCEEDED` events fire.

## Key elements
- `OfflinePaymentInput`: the parsed request body. It holds `method` (any `PaymentMethod` except `'card'`), an optional `reference`, and an optional `receivedAt` ISO string.
- `recordOfflinePayment(orderId, input, context)`: the only export besides the input type. It returns `ResponseSuccess<PaymentDocument> | ResponseReject`. Flow:
  1. Reject with 422 if `receivedAt` is in the future (`payments.received-at-future`, attached to the `receivedAt` field).
  2. Load the order by id through the orders service. If it is missing, return `orderNotFound()`.
  3. Load the existing payment with `paymentRepository.findByOrderId`.
  4. Refuse with `notPayable()` unless `isPayable(order.status)` is true or the case is a late transfer.
  5. If a payment already exists, call `cancelOpenIntent` so any open card intent is closed at the provider. A `PaymentInFlightError` becomes a 409 with `ERROR_CODES.PAYMENT_IN_FLIGHT`. Any other error is rethrown.
  6. Call `paymentRepository.upsertOffline` with the amount from `orderTotal(order)`, the order currency, the method, the reference and `receivedAt` (defaults to now). If it returns nothing, return `notPayable()`.
  7. Call `settlePayment(payment, { status: 'succeeded' }, false, context)`. If the order was lost during settlement, return `settlementResponse(settlement)`, unless the case is a late transfer.
  8. Write an audit record and emit an analytics event.
  9. Return 201 if the row was newly created, otherwise 200.

## Relationships
- **Orders** (`@modules/orders`): uses `orderService`, `buyerIdOf`, `orderTotal` and `isPayable`. The payability rule is delegated to the order lifecycle rather than compared against a literal status here.
- **Access** (`@modules/access`): `ownOrderFlag(context, buyerId)` adds an `ownOrder` flag to the audit metadata when the admin records money on their own order.
- **Payments siblings**:
  - `../repository`: `findByOrderId` and `upsertOffline`.
  - `./intent`: `cancelOpenIntent`.
  - `./settlement`: `settlePayment` and `settlementResponse`.
  - `./errors`: `notPayable` and `orderNotFound`.
  - `../providers`: `PaymentInFlightError`.
  - `../model`: the `PaymentDocument` type.
- **Audit and analytics**: `recordAudit` from `infrastructure/observability/audit` is called with the offline-recorded action from `../audit`. `emitAnalyticsEvent` and `buildAnalyticsBase` from `infrastructure/observability/analytics` are called with the offline-recorded event from `../analytics`.
- **Infrastructure**: `t` from i18n for messages, and `generateSuccess`, `generateReject` and `fieldError` from `http/response`. `ERROR_CODES` comes from `@api/error-codes`.

## Notes
- **Authorization**: the order lookup is unscoped. The file assumes `create:Payment` was already checked at the route, so this is an operator action and not a customer reading their own order.
- **Late transfer**: if the existing payment is `canceled` with a `transferReference` and the order is no longer payable, the money is still recorded onto that payment. In this case the `notPayable` refusal and the `orderLost` refusal are both skipped, and the answer is the payment itself.
- **Open card intents**: they are cancelled at the provider before the row is overwritten, so a later resolution there cannot charge with no local row to catch it.
- **Upsert fields**: the fields are passed explicitly because `order` is a hydrated Mongoose document, and spreading it copies nothing.
- **Status code**: 201 means a new row. 200 means an existing row, such as an unpaid card intent, was converted.
- **Context**: `context` carries the admin's identity, so no separate `authContext` parameter is needed.
