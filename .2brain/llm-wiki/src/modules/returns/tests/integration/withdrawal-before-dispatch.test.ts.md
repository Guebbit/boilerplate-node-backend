---
source: src/modules/returns/tests/integration/withdrawal-before-dispatch.test.ts
sha256: 3edebed6f430abe3a3191aa9c81d763a2ab937452517e945ce058e864f600b6e
generated_at: 2026-10-29T05:50:14.688044+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/withdrawal-before-dispatch.test.ts

## Purpose

Integration test that pins the cross-module behavior of a customer withdrawal (pre-dispatch cancel) on a paid order. It asserts that exactly one `payment.refunded` domain event fires, one credit note is created, and one acknowledgement mail is sent from `returns`—ensuring the refund and the return never announce the same money twice.

## Key elements

- **`paidOrder()`** – Setup helper. Creates a user, two products (Shirt $30, Mug $10), a two-item order, reserves inventory via `inventoryService.reserveForOrder`, charges the card via `payByCard`, and settles outbox nudges. Returns `{ user, orderId }`.
- **`jest.mock('@infrastructure/adapters/mailer')`** – Replaces `enqueueEmail` with a Jest mock so individual tests can assert which templates are sent and with what payload.
- **`beforeEach`** – Registers `paymentsModule`, `invoicingModule`, and `returnsModule` via `registerCheckoutModules`; clears the mailer mock.
- **`afterEach`** – Calls `resetDomainEvents()` to tear down any `onDomainEvent` subscriptions.
- **Test 1 – "refunds the payment once, issues its credit note, and writes the return closed"** – Calls `returnService.createReturn({ orderId, reason: 'withdrawal' })`. Asserts order status is `cancelled`, payment shows `displayStatus: 'refunded'` with `amountRefunded: 40`, the stored return has `status: 'closed'`, empty `lines`, and `refundAmount: 40`. Captures `PAYMENT_REFUNDED` events via `onDomainEvent` and verifies exactly one fires with `full: true` and **no** `returnId`. Checks `invoicingService.findCreditNotesForOrder` returns exactly 1 note.
- **Test 2 – "sends one mail from returns — the acknowledgement, never the return-closed notice"** – Filters `mockEnqueueEmail` calls for template `returns.notice`. Asserts exactly one, with subject *"We received your withdrawal"* and no `postage`/`address` fields (no goods to ship back).
- **Test 3 – "tells the buyer the money is back exactly once, and never mails a cancel notice"** – Uses the `eventually` poller to wait for the `payments.refund-issued` mail (sent asynchronously inside `announceRefund`). Asserts exactly one `payments.refund-issued`, exactly one `returns.notice`, and **zero** `orders.order-cancelled` mails.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/returns/module.ts` | Imported as `returnsModule`; registered in `beforeEach` so `returnService` routes through the full module graph. |
| `src/modules/payments/module.ts` / `index.ts` | `paymentsModule` registered in `beforeEach`; `paymentService.getForOrder` and `PAYMENT_REFUNDED` constant used in assertions. |
| `src/modules/invoicing/module.ts` / `index.ts` | `invoicingModule` registered in `beforeEach`; `invoicingService.findCreditNotesForOrder` used to assert exactly one credit note. |
| `src/modules/inventory/index.ts` | `inventoryService.reserveForOrder` called in `paidOrder()` to lock stock before payment. |
| `src/kernel/events.ts` | `onDomainEvent` subscribes to `PAYMENT_REFUNDED`; `resetDomainEvents` cleans up in `afterEach`. |
| `src/kernel/outbox.ts` | `settleOutboxNudges` flushes the outbox so relay-delivered events (refund, credit note, mails) are observable. |
| `src/infrastructure/adapters/mailer.ts` | Fully mocked; `enqueueEmail` calls are inspected to verify template names, subjects, and payload shape. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `readOrder`, `toOrderItem` build the order fixture. |
| `src/modules/products/tests/factories.ts` | `createProduct` creates the Shirt and Mug. |
| `src/modules/payments/tests/factories.ts` | `payByCard` performs the card payment in setup. |

## Notes

- **Return is a closed record, not a workflow.** The return row is written with `status: 'closed'` and empty `lines` at creation time. It exists as an audit trail beside the refund; it does not drive a separate close event.
- **The refund belongs to the order, not the return.** The `PAYMENT_REFUNDED` payload carries no `returnId`. The test explicitly asserts `refunds[0].returnId` is `undefined` to prevent a future refactor from tagging the return onto the refund (which would risk double-announcing).
- **`settleOutboxNudges` must be called after `createReturn` and again after the first settle.** The first call delivers the settlement rows; the second call delivers the credit-note creation that is itself a listener of `PAYMENT_REFUNDED`. Both run inside the same relay pass, but the drain waits for both.
- **`eventually` is required for the `payments.refund-issued` mail.** `announceRefund` kicks off the email with `void`, so the send is not synchronous. The `eventually` poller (from `@tests/eventually`) retries until the mock has recorded the call.
- **`asCustomer` vs `asAdmin`.** `createReturn` is called as the customer (the actor who withdrew); `paymentService.getForOrder` is called as admin (the test observer reading the payment record).
