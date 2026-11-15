---
source: src/modules/invoicing/tests/integration/credit-note-catch-up.test.ts
sha256: 28d0b14b07bac397466ca5b769f2134c36d117d670c3a5b1717ae98e45717680
generated_at: 2026-11-14T20:14:26.334017+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/credit-note-catch-up.test.ts

## Purpose

Integration test verifying the "catch-up" path: when an invoice-issuing event died in the outbox and is later revived, the system re-issues the invoice and then creates one credit note per already-settled refund (oldest first, idempotently), while skipping any refund that has not yet settled. Runs against real Mongo through the real `invoicingModule` subscription to the paid event.

## Key elements

- **`paidWithDeadInvoice()`** – Creates a user, product, and a 2-item order (total 100.00); pays it via `paymentService` and waits for the invoice to appear. Returns the `orderId`.
- **`refund(orderId, amount)`** – Calls `refundOrderPayment` as an admin, then `settleOutboxNudges()` so the credit-note listener fires.
- **`loseInvoice(orderId)`** – Deletes both `invoiceModel` and `creditNoteModel` rows for the order, simulating the state after a dead outbox event.
- **`revive(orderId)`** – Re-emits `ORDER_STATUS_CHANGED` (pending → paid) via `emitDomainEvent`, mimicking what reviving the dead outbox row does.
- **`describe('reviving a dead invoice event')`** – Two specs:
  1. Two settled refunds → after revival (called twice for idempotency) exactly two notes appear in settlement order, both linked to the re-issued invoice.
  2. A refund that was declined (via fake) → after revival the invoice re-issues but no credit note is created.

## Relationships

- **`src/kernel/events.ts`** – `emitDomainEvent` (revive) and `resetDomainEvents` (teardown).
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` to drain the outbox after each refund.
- **`src/kernel/registry.ts`** – `registerModules` wires all six modules in `beforeEach`.
- **`src/modules/invoicing/module.ts`** – The real module whose subscription to the paid event is under test.
- **`src/modules/invoicing/model.ts`** – `invoiceModel` / `creditNoteModel` used directly in `loseInvoice` and assertions.
- **`src/modules/invoicing/repository.ts`** – `findCreditNotesByOrderId` for all note-level assertions.
- **`src/modules/invoicing/tests/factories.ts`** – `waitForInvoice` helper.
- **`src/modules/orders/index.ts`** – Exports `ORDER_STATUS_CHANGED` used by `revive`.
- **`src/modules/orders/module.ts`** – Registered so the orders module participates in the event flow.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`.
- **`src/modules/payments/index.ts`** – Exports `paymentService` used for intent/confirm flow.
- **`src/modules/payments/module.ts`** – Registered so the payments module processes refund events.
- **`src/modules/payments/services/index.ts`** – Source of `paymentService` re-exported via the payments index.
- **`src/modules/inventory/module.ts`** – Registered (required by order fulfilment flow).
- **`scenarios/support/doubles/payments/fake.ts`** – `setFakeRefundFailure` forces a "declined" refund to test the un-settled path.

## Notes

- The test deliberately avoids mocking the invoicing module; it exercises the real subscription to verify end-to-end event wiring.
- `revive` is called **twice** in the first spec specifically to prove idempotency (no duplicate notes).
- `loseInvoice` operates at the Mongoose model level (bypassing the repository) because the goal is to simulate a state the repository would never intentionally produce.
- The fake refund failure (`setFakeRefundFailure`) is the only injected double; everything else (Mongo, outbox, event bus, module subscriptions) is real.
