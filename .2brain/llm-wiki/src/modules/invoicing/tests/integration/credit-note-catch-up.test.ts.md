---
source: src/modules/invoicing/tests/integration/credit-note-catch-up.test.ts
sha256: 95bb5f8e19b4eaa0d0f64947aa07e928e85094e7e29b89028d96d604d3d3bf2c
generated_at: 2026-10-29T04:16:27.433733+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/credit-note-catch-up.test.ts

## Purpose

Integration test for the credit-note catch-up path: when an invoice domain event was lost (the "dead invoice" scenario) and refunds settled in the meantime, reviving the event must issue the invoice and then create one credit note per settled refund (oldest first), without duplicates and without notes for refunds that never settled. Runs against real MongoDB through the invoicing module's own event subscription rather than calling services directly.

## Key elements

- **`paidWithDeadInvoice()`** – Sets up the precondition: creates a user, product, order; performs a real payment via `paymentService`; waits for the invoice to exist. Returns the `orderId`.
- **`refund(orderId, amount)`** – Issues a refund through `refundOrderPayment` (admin context) and calls `settleOutboxNudges()` so the credit-note listener fires.
- **`loseInvoice(orderId)`** – Deletes the invoice and all credit notes for the order via Mongoose `deleteMany`, simulating the lost-event state.
- **`revive(orderId)`** – Re-emits `ORDER_STATUS_CHANGED` (`pending → paid`) via `emitDomainEvent`, replaying what the dead outbox row would do.
- **Test: "issues the invoice, then one note per settled refund in settlement order, once"** – Refunds 30 and 20, loses the invoice, revives the event **twice** (idempotency), asserts exactly two notes exist with totals `[20, 30]` and both reference the same invoice.
- **Test: "issues no note for a refund that has not settled"** – Sets `setFakeRefundFailure` to `'declined'`, refunds, loses the invoice, revives, and asserts zero credit notes.

## Relationships

- **`src/kernel/registry.ts`** – `registerModules` wires all six domain modules before each test.
- **`src/kernel/events.ts`** – `emitDomainEvent` (used by `revive`) and `resetDomainEvents` (in `afterEach`).
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` drives the outbox processor so the credit-note subscription actually executes.
- **`src/modules/invoicing/module.ts`** – The subscription under test; its `ORDER_STATUS_CHANGED` handler issues the invoice and iterates settled refunds.
- **`src/modules/invoicing/model.ts`** – `invoiceModel` / `creditNoteModel` used by `loseInvoice` to wipe state.
- **`src/modules/invoicing/repository.ts`** – `invoicingRepository.findCreditNotesByOrderId` is the assertion surface.
- **`src/modules/invoicing/tests/factories.ts`** – `waitForInvoice` polls until the invoice document exists.
- **`src/modules/orders/index.ts`** – Exports the `ORDER_STATUS_CHANGED` event constant consumed by `revive`.
- **`src/modules/orders/module.ts`** – Registered so the order-status lifecycle is available.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` build the test order.
- **`src/modules/payments/index.ts`** – `paymentService` for intent/confirm in the setup helper.
- **`src/modules/payments/module.ts`** – Registered; owns the refund → outbox → credit-note chain.
- **`src/modules/payments/services/index.ts`** – Source of `paymentService` re-exported through the payments index.
- **`src/modules/payments/tests/factories.ts`** – `refundOrderPayment` and `providerRefOf` used by the `refund` helper and the failure scenario.
- **`scenarios/support/doubles/payments/fake.ts`** – `setFakeRefundFailure` injects a provider-level decline so a refund never settles.
- **`src/modules/inventory/module.ts`** – Registered as a dependency of the order/payment flow.

## Notes

- The "dead invoice" state is **simulated by deleting documents**, not by killing an outbox row. This means the test validates the subscription's handler logic, not the outbox retry mechanism itself.
- `revive` is intentionally called **twice** in the first test to assert the handler is idempotent (no duplicate notes).
- The test relies on `settleOutboxNudges()` after each refund; without it the credit-note listener would not run and assertions would time out.
- Uses `eventually` (from `@tests/eventually`) for async polling rather than a fixed delay, because the subscription is event-driven and timing is non-deterministic.
- `ORDER_STATUS_CHANGED` is emitted with `from: 'pending', to: 'paid'` — the invoicing subscription presumably keys off the `to` value.
