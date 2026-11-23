---
source: src/modules/returns/tests/integration/withdrawal-before-dispatch.test.ts
source_sha256: 4e8f686f92c674187c8850cb4d613b7e5f37f1ba10289f355f4b5999b379ba30
context_sha256: 48c87e25d04ddf9c660b3cfb26c3c9d1af6fd4f9211093ca12e01afcfa7f6d1e
generated_at: 2026-11-22T07:38:33.750278+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/withdrawal-before-dispatch.test.ts

## Purpose
Integration test for a customer withdrawal on a paid order before dispatch. It checks that the order is canceled, the full payment is refunded through the order's own refund path, and the return record is written already closed. It pins what crosses module boundaries, so that a refund and a return never announce the same money twice: one `payment.refunded` event, one credit note, and one mail from `returns`.

## Key elements
- `paidOrder()`: helper that creates a user, a shirt (30.00) and a mug (10.00), and an order for both. It reserves inventory, pays by card, and calls `settleOutboxNudges()` so the settlement rows are published. It returns `{ user, orderId }`.
- `mockEnqueueEmail`: a `jest.mock` of the mailer adapter's `enqueueEmail`. Cases assert which mail templates were enqueued.
- `withdrawalRows(orderId)`: counts outbox rows for the order named `order.canceled`, `return.requested` or `return.closed`, whatever their delivery state.
- Suite "a withdrawal before dispatch on a paid order" has four cases:
  - **Refund, credit note and closed return**: the order is `canceled`. The payment shows `refunded` with `amountRefunded` `'40.00'`. The return is `closed` with `refundAmount` `'40.00'` and no lines. Exactly one `PAYMENT_REFUNDED` event fires, with `full: true` and no `returnId`. Exactly one credit note exists.
  - **Refund due date**: `storedRefundStamps` holds `dueRule: 'withdrawal'` and a `dueBy` equal to `withdrawalRefundDueBy(requestedAt, shopTimezone())`. The test title describes this as the end of the shop day 14 days after the shop was told.
  - **One mail from `returns`**: a single `returns.notice` with subject "We received your withdrawal" and no postage or address.
  - **Refund mail**: exactly one `payments.refund-issued`, one `returns.notice`, and zero `orders.order-canceled`.
- Suite "a withdrawal before dispatch that dies half way" has two cases, both expecting `createReturn` to reject with "disk full":
  - `returnRepository.create` fails.
  - `outboxEventModel.create` fails.
  - In both, the order stays `paid`, no return exists, and no withdrawal outbox rows exist.

## Relationships
- The code under test is the `returns` module's `returnService` and `returnRepository`; `returnsModule` is registered with `paymentsModule` and `invoicingModule` through `registerCheckoutModules`.
- `@kernel/events`: `onDomainEvent` subscribes to `PAYMENT_REFUNDED` (from `@modules/payments`), and `resetDomainEvents` runs in `afterEach`.
- `@kernel/outbox`: `settleOutboxNudges` waits for the relay to deliver events. `outboxEventModel` is used to count rows and to inject a failure.
- `@infrastructure/adapters/mailer`: mocked so the tests can inspect the enqueued mail.
- `@modules/payments` (`PAYMENT_REFUNDED`, `paymentService`, and the factories `payByCard` and `storedRefundStamps`) and its `module` are used to verify the refund and register the module.
- `@modules/invoicing` and its `module` are used to check the credit note and register the module.
- `@modules/inventory` is used to reserve stock when setting up the paid order.
- `@modules/orders` supplies the order factories (`createOrder`, `readOrder`, `toOrderItem`) and `withdrawalRefundDueBy`.

## Notes
- Event delivery is asynchronous through the outbox relay, so the tests call `settleOutboxNudges()` before asserting. The refund mail is started with `void` inside `announceRefund`, so one case also polls with `eventually(...)`.
- The refund belongs to the order's cancel, not to the return. That is why the `payment.refunded` payload has no `returnId`, and why the already-closed return is not closed again.
- The failure cases verify atomicity: the cancel and the return record are written together or not at all.
