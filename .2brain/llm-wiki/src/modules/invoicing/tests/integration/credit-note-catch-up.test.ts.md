---
source: src/modules/invoicing/tests/integration/credit-note-catch-up.test.ts
sha256: 4d9accb17ef3adbd9dd461014c9a1c2c629883adaaddc36c452d21816e5b6df2
generated_at: 2026-11-08T06:16:46.157232+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/credit-note-catch-up.test.ts

## Purpose

Integration test that verifies the credit-note catch-up path: when an invoice event was missed (the invoice row was lost) and the `ORDER_STATUS_CHANGED → paid` event is re-emitted, the system issues the invoice and then creates one credit note per **settled** refund in settlement order, idempotently, while skipping refunds that never settled. Runs against real Mongo with the full module registry.

## Key elements

- **`paidWithDeadInvoice()`** — Sets up a user, a product (2 × 50.00), an order, and a confirmed payment so an invoice exists. Returns the `orderId`.
- **`refund(orderId, amount)`** — Calls `refundOrderPayment` as an admin, then `settleOutboxNudges()` to let the invoicing subscription for the refund event execute.
- **`loseInvoice(orderId)`** — Deletes the `invoiceModel` and `creditNoteModel` rows for the order, simulating the "dead invoice" state.
- **`revive(orderId)`** — Re-emits `ORDER_STATUS_CHANGED` (pending → paid) via `emitDomainEvent`, mimicking a dead outbox row being replayed.
- **Test: "issues the invoice, then one note per settled refund in settlement order, once"** — Refunds 30.00 and 20.00, wipes the invoice, revives the event **twice**, and asserts the invoice reappears with exactly two notes (20.00, 30.00) linked to it.
- **Test: "issues no note for a refund that has not settled"** — Uses `setFakeRefundFailure` to force a declined refund, wipes the invoice, revives, and asserts zero credit notes.

## Relationships

- **`src/kernel/events.ts`** — `emitDomainEvent` (revive), `resetDomainEvents` (teardown).
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` flushes the outbox so the invoicing subscription fires after each refund.
- **`src/kernel/registry.ts`** — `registerModules` wires all six modules per test.
- **`src/modules/invoicing/module.ts`** — The module under test; its subscription to the paid event performs the invoice issuance and credit-note catch-up.
- **`src/modules/invoicing/model.ts`** — `invoiceModel` / `creditNoteModel` used directly in `loseInvoice` to simulate data loss.
- **`src/modules/invoicing/repository.ts`** — `invoicingRepository.findCreditNotesByOrderId` for assertions.
- **`src/modules/invoicing/tests/factories.ts`** — `waitForInvoice` helper.
- **`src/modules/orders/index.ts`** — Exports `ORDER_STATUS_CHANGED` event name.
- **`src/modules/orders/module.ts`** / **`src/modules/orders/tests/factories.ts`** — Order creation and module registration.
- **`src/modules/payments/index.ts`** — Exports `paymentService` used for intent creation and payment confirmation.
- **`src/modules/payments/module.ts`** — Registered so its own subscription (the "door" for refunds) is active.
- **`src/modules/payments/services/index.ts`** — Provides `refundOrderPayment` (imported via the payments test factories which wraps the service).
- **`scenarios/support/doubles/payments/fake.ts`** — `setFakeRefundFailure` to simulate a declined refund provider response.
- **`src/modules/inventory/module.ts`** — Registered as a peer dependency of the invoicing flow (no direct calls in this test).

## Notes

- The first test calls `revive` **twice** specifically to assert idempotency ("never twice").
- Refunds go through the `payments` module's public door (`refundOrderPayment`), not a direct repository call, so the test exercises the real event-driven subscription path.
- `eventually` is used for the credit-note count assertion because the subscription is async relative to `waitForInvoice`.
- The test file uses `setupTestDb()` (real Mongo) rather than an in-memory store, so timing-sensitive outbox nudges are flushed explicitly via `settleOutboxNudges`.
