---
source: src/modules/returns/tests/integration/withdrawal-before-dispatch.test.ts
sha256: be338000b9fcebd328b516441be2594a761672f9c2f1c49bd7d5ec5e01b40da8
generated_at: 2026-11-08T08:12:12.037783+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/withdrawal-before-dispatch.test.ts

## Purpose

Integration test that pins the cross-module contract for a customer withdrawal on a paid, undispatched order. It verifies that the order is canceled, the full amount is refunded exactly once through the order's own refund path (not a second time via the return), one credit note is issued, the return is written as closed at birth, and exactly one acknowledgement email goes out from the returns module — ensuring a refund and a return never announce the same money twice.

## Key elements

- **`paidOrder()`** — local async helper that creates a user, two products (Shirt 30.00, Mug 10.00), an order, reserves inventory, pays by card, and drains the outbox so the settlement rows are published. Returns `{ user, orderId }`.
- **"refunds the payment once, issues its credit note, and writes the return closed"** — asserts order status is `canceled`, payment shows `amountRefunded: '40.00'` with `displayStatus: 'refunded'`, the stored return is `{ status: 'closed', refundAmount: '40.00', lines: [] }`, exactly one `PAYMENT_REFUNDED` event fires with no `returnId`, and exactly one credit note exists.
- **"sends one mail from returns — the acknowledgement, never the return-closed notice"** — asserts exactly one `returns.notice` email (subject "We received your withdrawal") and that it carries no `postage` or `address` (no goods to ship back).
- **"tells the buyer the money is back exactly once, and never mails a cancel notice"** — asserts exactly one `payments.refund-issued` mail, one `returns.notice` mail, and zero `orders.order-canceled` mails. Uses `eventually()` because the refund mail starts inside `announceRefund` with `void`, so `settleOutboxNudges` returns before it is sent.
- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a jest mock for call-count and template assertions.
- **`beforeEach`** — registers `paymentsModule`, `invoicingModule`, and `returnsModule` via `registerCheckoutModules`; clears the mail mock.
- **`afterEach`** — calls `resetDomainEvents()` to detach event listeners.

## Relationships

- **`src/modules/returns/module.ts`** (`returnsModule`) — imported and registered in `beforeEach`; the module under test.
- **`src/modules/payments/services/index.ts`** — `paymentService.getForOrder` and `PAYMENT_REFUNDED` event constant are used to assert refund state and capture the event.
- **`src/modules/payments/module.ts`** (`paymentsModule`) — registered so its listeners (refund announcement) run during the outbox drain.
- **`src/modules/invoicing/services/index.ts`** (`invoicingService`) — `findCreditNotesForOrder` asserts exactly one credit note.
- **`src/modules/invoicing/module.ts`** (`invoicingModule`) — registered so its credit-note listener runs.
- **`src/modules/inventory/index.ts`** (`inventoryService`) — `reserveForOrder` called in setup to lock stock before payment.
- **`src/kernel/events.ts`** — `onDomainEvent` captures `PAYMENT_REFUNDED`; `resetDomainEvents` tears down listeners.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` drains the relay so domain-event listeners fire before assertions.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is the mocked function used to count and inspect outgoing emails.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `readOrder`, `toOrderItem` build and inspect the order fixture.
- **`src/modules/products/tests/factories.ts`** — `createProduct` creates the two line-item products.
- **`src/modules/payments/tests/factories.ts`** — `payByCard` simulates a successful card payment.

## Notes

- `settleOutboxNudges()` must be called **after** `createReturn` resolves, because the relay publishes settlement rows asynchronously. Calling it before will miss the `PAYMENT_REFUNDED` event.
- The refund mail (`payments.refund-issued`) is enqueued with a `void` promise inside `announceRefund`, so a single `settleOutboxNudges` pass does **not** guarantee it has been sent. The test uses `eventually()` to poll until the mock records the call.
- The `PAYMENT_REFUNDED` payload is asserted to have `returnId === undefined`. This is intentional: the refund belongs to the **order's** cancel path, not the return record. A second refund event carrying a `returnId` would indicate a double-announcement bug.
- The test explicitly asserts **zero** `orders.order-canceled` mails. A withdrawal is acknowledged by the returns module; the order-cancel mail is a different path and must not fire here.
- `testCallerContext` is passed as the third argument to `returnService.createReturn`; it is not a standard service parameter and exists only for test observability.
