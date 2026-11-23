---
source: src/modules/returns/tests/integration/hand-paid-refund.test.ts
source_sha256: 5194ee0aac87a849e1043dd2a10d9e7804f83f8804e0b7fade3e0e7af5921a88
context_sha256: 0ae32370f17313279a0824843e7db797e9ad0e189ef2cff18cb699feef935813
generated_at: 2026-11-22T07:34:13.114878+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/hand-paid-refund.test.ts

## Purpose
Integration tests for refunds on orders paid by hand (cash or transfer). Nobody can confirm that the money actually went back, so a received return or a buyer's withdrawal only opens the refund. The refund stays `pending` and is recorded as owed (`payment.refund_owed_by_hand`). It stays that way until an operator calls `settleRefundByHand`. A return waits in `received` until then.

## Key elements
- `setupTestDb()`, `beforeEach` and `afterEach`:
  - Set up the test DB.
  - Register the payments and returns modules through `registerCheckoutModules`.
  - Install an audit sink that collects entries into `audited`.
  - Reset domain events and restore mocks after each test.
- `owedRows()`: filters `audited` for `payment.refund_owed_by_hand` entries.
- `paidInCash()`: fixture helper.
  - Creates a user with a distinct email, a Shirt (30.00) and a Mug (10.00).
  - Creates an order of 2 shirts and 1 mug.
  - Reserves stock through `inventoryService.reserveForOrder`.
  - Records a cash payment as admin.
  - Returns `{ user, shirt, mug, orderId }`.
- `paymentOf(orderId)`: reads the payment through `paymentService.getForOrder` as admin.
- Test 1, a received return on a cash-paid order:
  - The order is delivered, then the customer creates a `withdrawal` return, then the warehouse receives it.
  - The return is `received`, and exactly one refund exists, `pending` with reason `return` and no `settledByHand`.
  - One owed audit row exists, with the refund id and reason in its metadata.
  - After `settleRefundByHand`, the `payment.refunded` event closes the return (checked with `eventually`). No extra owed row appears.
- Test 2, a refund that pays for no return:
  - A `PAYMENT_REFUNDED` event is emitted by hand with no `returnId`.
  - The return stays `received`.
- Test 3, a buyer cancelling the unshipped remainder:
  - The order is forced to `processing`, and the shirts are shipped through `deliveryService.shipFulfillmentOrder`.
  - The customer then creates a `kind: 'cancellation'` return.
  - One refund is opened, `pending` with reason `cancellation`, with no `settledByHand` and one owed audit row.

## Relationships
- `@modules/payments` and `payments/module`: `paymentService` (`recordOfflinePayment`, `getForOrder`, `settleRefundByHand`) and the `PAYMENT_REFUNDED` event.
- `../../module` and `../../services`: `returnService` (`createReturn`, `receiveReturn`) is the entry point under test; `../../repository` is also imported to read stored return status.
- `@modules/inventory`: reserves stock.
- `@modules/delivery`: ships a fulfillment order.
- Delivery, orders and products test factories: `carryOrderTo`, `fulfillmentOrdersOf`, `createOrder`, `forceOrderStatus`, `toOrderItem` and `createProduct`.
- `@kernel/events`: `emitDomainEvent` and `resetDomainEvents`.
- `@infrastructure/observability/audit`: `registerAuditSink` and `AuditEntry`.

## Notes
- Test 2 checks that a refund without a `returnId` does not close a return that is waiting on its own refund.
- Test 1 relies on the asynchronous `payment.refunded` event handling, so it polls with `eventually`.
- The fixture helper increments a module-level `customers` counter to keep emails unique.
