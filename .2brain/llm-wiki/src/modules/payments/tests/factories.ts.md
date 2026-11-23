---
source: src/modules/payments/tests/factories.ts
source_sha256: eb33364b5269e26362fb8fc5f5adda0d1db59f51193d308b7b592fa68ae7299e
context_sha256: 4f625a51aa439bc49390a01609dc5f5583e99d8f48af823bb41981f28d630acc
generated_at: 2026-11-22T06:55:16.027830+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/factories.ts

## Purpose
Test factories for the payments module. They cover paying an order by card and building a bank-transfer order the way checkout leaves it. The transfer payment is opened by calling the module's own `order.created` listener path once, so tests get a real reference, deadline and `requires_action` row. The file writes nothing outside that path.

## Key elements
- `refundForOrder`: re-exported from `../services/refunds`. It is the cancel listener's refund, exposed for sibling tests that need a refunded order. It is not on `paymentService`.
- `refundForReturn(orderId, input, context)`: mimics what `returns` does. It calls `paymentService.openReturnRefund` inside `withTransaction` (currency defaults to `EUR`), then `sendOpenedRefund` after the commit. It resolves to `'settled'`, `'open'` or `null` (nothing owed).
- `TransferOrderOptions`: optional `user` (a fresh customer by default), `price` (`'20.00'` by default) and `holdHours` (168 by default).
- `transferOrder(options)`: creates a user, a product and a pending `bank_transfer` order with one line and a `payBy` deadline. It then calls `paymentService.openTransferPayment` and loads the payment. It returns `{ order, payment, reference }`, where the reference comes from `buildReference(orderId)`. It throws if the payment did not open.
- `payByCard(order, user)`: creates an intent as the customer, then confirms it with `pm_card_visa` through the fake provider. It throws if the intent is refused.
- `refundOrderPayment(orderId, authContext, context, body?)`: the operator refund addressed by order id. It finds the payment and calls `paymentService.refundPayment`. If there is no payment, it passes the order id through and returns the service's refusal.
- `providerRefOf(orderId)`: returns the provider's intent id for the order's payment. It throws if there is none.
- `storedRefundStamps(orderId)`: returns each stored refund's `reason`, `returnId`, `dueBy` and `dueRule`, or an empty array if there is no payment.

## Relationships
- Uses `paymentService` (`../services`), `paymentRepository` (`../repository`) and `buildReference` (`../domain`). `PaymentDocument` comes from `../model`. `refundForOrder` is re-exported from `../services/refunds`.
- Builds orders with `createOrder` and `toOrderItem` from `src/modules/orders/tests/factories.ts`. It takes the `OrderDocument` type from the orders module.
- Uses `withTransaction` from `src/infrastructure/runtime/database.ts` and `HOUR_MS` from `src/domain-primitives/time.ts`.
- Pulls users, products and caller helpers from other modules' test factories and from `@tests/callers`.
- The neighbor tests listed in the graph consume these helpers: `src/modules/payments/tests/contract/api.contract.test.ts`, the two invoicing integration tests (`src/modules/invoicing/tests/integration/issue-credit-note.test.ts` and `src/modules/invoicing/tests/integration/credit-note-catch-up.test.ts`) and `src/modules/account/tests/contract/shop.contract.test.ts`.

## Notes
- `payByCard` does not deliver the settlement's events, because delivery happens after the response. A test that moves the order on must settle the outbox itself.
- `providerRefOf` and `storedRefundStamps` expose data the wire never publishes: the provider id and the staff-only deadline stamp.
