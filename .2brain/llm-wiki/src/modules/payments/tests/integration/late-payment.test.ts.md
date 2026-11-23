---
source: src/modules/payments/tests/integration/late-payment.test.ts
source_sha256: 8d2c213eb0d8dc50a4c8160c33ee4f732787033d91c5e561d6d566177af5c357
context_sha256: c8cc310283bebbbfa361249c362b35b85ff608c1c749c4e6e9324896dadf0a5c
generated_at: 2026-11-22T06:57:46.109982+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/late-payment.test.ts

## Purpose
Integration tests for money that arrives after an order's inventory hold was released but before its cancellation ran. The units are re-taken inside the payment's transaction. If the shelf still has them, the order is paid as usual. If not, the order stays `pending`, the payment is refunded, and the later cancel ends the order. The fake PSP plays the provider, and the app is reached only through the settlement entry points, as with a real late webhook.

## Key elements
- `mockEnqueueEmail`: Jest mock of `enqueueEmail` from the mailer adapter. Tests assert which template was enqueued.
- `levelOf(productId)`: settles outbox nudges, then returns `{ onHand, reserved }` for a product.
- `refundsOf(orderId)`: reads the refund records from the order's payment via `paymentRepository`.
- `orderStatusOf(orderId)`: reads the order's status via `orderService.getById`.
- `heldOrderFor(user, product, extras)`: creates a one-unit order and takes its hold with `inventoryService.reserveForOrder`, as checkout leaves it. It throws if the hold is refused.
- `expiredCardOrder(onHand)`: creates a card order with an open intent, then releases its hold with reason `'expire'`. Returns `{ orderId, product, productId, providerRef }`.
- Test groups:
  - **Card payment on a released hold**:
    - Stock still available: the order becomes `paid`, `reserved` is 1, stock is bound to the order, and there are no refunds.
    - Units sold meanwhile: the order stays `pending`, the hold stays released, and the payment is `succeeded` with one refund of reason `late_payment`. No `payment.refund_owed_by_hand` audit entry is recorded, and a later `expireReservationById` cancels the order.
    - The buyer is mailed a `payments.refund-issued` email.
    - Canceled before the money landed: the order stays `canceled`, and the ledger holds only `expire` and `reserve` movements.
  - **Hand-recorded (bank transfer) payment on a released hold**:
    - Units sold meanwhile: `recordOfflinePayment` rejects with 409, but the payment is recorded as `succeeded` with `amountRefunded` `'20.00'`. The refund stays open, since an operator returns it off-system.
    - Units available: the order is paid.
  - **Order handed money it could not take**: the visible part checks that an order canceled this way (never `paidAt`, succeeded payment, refund) is kept from a hard delete (`removeById`) and that the action flags say so. The file content provided cuts off before the end of this test.

## Relationships
- `paymentService` (`payments/services`): `createIntent`, `applyWebhookSettlement`, `openTransferPayment` and `recordOfflinePayment` are the entry points under test.
- `paymentRepository` and `paymentsModule` (`payments/repository`, `payments/module`): the repository is read for payment and refund state. The module is registered through `registerCheckoutModules`.
- `fakePaymentProvider` (`scenarios/support/doubles/payments/fake`): `confirm(providerRef, 'pm_card_visa')` simulates the provider confirming a card payment.
- `inventoryService` (`modules/inventory`): reserves and releases holds, and answers `isStockBoundToOrder`, `isHoldReleased` and `listMovements`.
- `orderService` (`modules/orders`): `getById`, `expireReservationById`, `withActions` and `removeById`.
- `src/kernel/outbox` (`settleOutboxNudges`) and `src/kernel/events` (`resetDomainEvents`, called in `afterEach`): flush the outbox and reset domain events.
- `infrastructure/observability/audit`: `registerAuditSink` captures audit entries.
- `infrastructure/adapters/mailer`: `enqueueEmail` is replaced by the mock above.
- Test factories (`users`, `products`, `orders`): `createUser`, `createProduct`, `countersOf`, `createOrder`, `toOrderItem`.
- Helpers from `@tests/*`: `setupTestDb`, `registerCheckoutModules`, the caller helpers, `asReject` and `eventually`.

## Notes
- The file uses the real order, inventory and payment services with a test DB. Only the mailer and the PSP are replaced.
- Several assertions follow `settleOutboxNudges()`, because stock counters are refreshed through the outbox.
- The email assertion uses `eventually`, since delivery is asynchronous.
- Where the units were sold meanwhile, the tests create a second customer's hold to take the last unit.
