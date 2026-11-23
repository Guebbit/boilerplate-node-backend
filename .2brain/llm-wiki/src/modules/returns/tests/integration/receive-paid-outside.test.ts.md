---
source: src/modules/returns/tests/integration/receive-paid-outside.test.ts
source_sha256: e93194385706df12cbd8243562f8e833a04126bfb3b7d09c4e3bc5667878a058
context_sha256: 375bc10d67c7b5751671f2c40ff44534535cfa589ff64ab5c0f68cf1e5e1cd34
generated_at: 2026-11-22T07:35:49.439076+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/receive-paid-outside.test.ts

## Purpose
Integration test suite for receiving a return when buyer staff has already paid the refund outside the application (`paidOutside`). It checks that the refund record is created already settled by hand inside the receipt's transaction, that the card is never refunded a second time, and that the return closes in the same step. It runs against a real test database, the real `fake` payment provider and the real credit-note listener.

## Key elements
- **`setupTestDb()` / `beforeEach` / `afterEach`**: set up the DB. Before each test, `beforeEach` registers the payments, invoicing and returns modules and installs an audit sink that collects `AuditEntry` rows into `audited`. After each test, `afterEach` calls `resetDomainEvents()` and restores the jest mocks.
- **`paidAndDelivered()`**: builds a fixture with a unique user, a "Shirt" product (30.00, qty 2), an order, an inventory reservation, a card payment intent confirmed with `pm_card_visa`, and the order carried to `delivered`. The payment totals 60.00.
- **`openedReturn(fixture, reason)`**: creates a return on the whole order. A `withdrawal` is born approved. Any other reason is approved explicitly by an admin. It then calls `settleOutboxNudges()` and returns the return id.
- **`paymentOf`, `statusOf`, `todoFacts`**: helpers that read the payment as an admin, read the return status, and query outbox events named `payment.refund_owed_by_hand` or `payment.return_refund_short`.
- **Test cases** (`describe` "a return received with the refund paid outside"):
  - Happy path: the return closes and `fakePaymentProvider.refund` is not called. One refund is recorded for 60.00, `succeeded`, `settledByHand`, `reason: 'return'`, with the `paidOutside` details. `amountRefunded` is 60.00 and `closedAt` is set. One credit note is issued (awaited with `eventually`). No to-do facts are created. Exactly one `admin.payment.refund_settled_by_hand` audit row is written.
  - A `warehouse` caller, who may receive but not refund, gets 403. Nothing changes: the return stays `approved`, there are no refunds, and the stock counters are unchanged.
  - A `replace` remedy combined with `paidOutside` gets 422 `RETURN_REMEDY_INVALID` with `details.field = 'paidOutside'`.
  - If proof of sending already opened the refund, the receive call gets 409 `RETURN_REFUND_OPENED_ON_PROOF`. The single existing refund is not settled by hand.
  - Capped refund: with 40.00 already refunded, the new record is 20.00 (the amount left), settled by hand, and the return closes with `refundAmount` 60.00. A `payment.return_refund_short` fact is emitted with `asked: '60.00'` and `opened: '20.00'`.

## Relationships
- Registers `paymentsModule` (`payments/module`) and `invoicingModule` (`invoicing/module`) in `beforeEach`. It also registers the returns module, which is not a listed neighbor.
- Uses `paymentService` from `payments` (`createIntent`, `confirmPayment`, `getForOrder`) and `refundOrderPayment` from `payments/tests/factories` to set up and read the payment.
- Imports `fakePaymentProvider` from `scenarios/support/doubles/payments/fake.ts` and spies on it to assert the card is never asked.
- Imports `inventoryService` from `inventory` and `invoicingService` from `invoicing`. The first reserves stock for the order fixture. The second is polled to verify the credit-note listener ran.
- `@kernel/events` (`resetDomainEvents`) and `@kernel/outbox` (`outboxEventModel`, `settleOutboxNudges`) are used for event isolation and to inspect to-do facts.
- `registerAuditSink` from `@infrastructure/observability/audit` captures audit rows.
- `createOrder`/`toOrderItem` (orders factories) and `carryOrderTo` (delivery factories) build the order fixture.

## Notes
- The settlement audit row is asserted to be written once the receipt has committed, not inside its transaction.
- The `payment.return_refund_short` to-do is documented as clearing only on a hand close (`return.closed_by_hand`), never on this automatic close.
- `customers` is a module-level counter that gives each fixture a distinct email.
