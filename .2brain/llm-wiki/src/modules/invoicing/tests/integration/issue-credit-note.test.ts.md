---
source: src/modules/invoicing/tests/integration/issue-credit-note.test.ts
sha256: 7ed2585f251ee0a899088f33ce4cfe4cef1fece8479468e3857b94b07153e3d5
generated_at: 2026-10-14T16:11:18.670834+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/issue-credit-note.test.ts

## Purpose

Integration test that verifies credit-note issuance as a full pipeline: a refund on a `succeeded` payment fires `PAYMENT_REFUNDED`, which the invoicing module's subscription handles to freeze a credit note. It covers numbering, PII re-encryption, line mirroring, partial refunds, idempotency, timezone-aware series, concurrent-writer safety, number-counter rollback, and the no-invoice no-op path.

## Key elements

- **`FAKE_SUCCESS_METHOD`** – constant (`'pm_card_visa'`) matching the fake PSP's "always succeeds" card reference.
- **`waitUntil(read, timeoutMs?)`** – polling helper that repeatedly invokes an async reader until it returns a truthy value or times out (default 2 s). Used because the `PAYMENT_REFUNDED` listener writes fire-and-forget.
- **`paidAndInvoiced(overrides?)`** – fixture that creates a user, a 25.00 product, an order, a payment intent, confirms it, and waits for the invoice to appear. Returns `{ orderId, invoice }`.
- **`waitForNotes(orderId, count)`** – convenience wrapper around `waitUntil` that resolves once the repository reports `count` or more credit notes for the order.
- **`describe('issuing a credit note off PAYMENT_REFUNDED')`** – the single describe block containing nine `it` cases:
  - Number format (`YYYY-NNNNNN`) and linkage to the parent invoice.
  - PII re-encryption under the credit-note's own document id (verified via `decryptInvoiceParty`).
  - Full-refund mirroring of lines, net, tax, and grand totals.
  - Two partial refunds producing two notes with distinct numbers, `refundId`s, and correct sub-totals.
  - Idempotency: re-calling `issueCreditNote` with the same `refundId` returns the existing note and creates no duplicate.
  - Shop-timezone year boundary (frozen clock at 23:30 UTC on 31 Dec → number starts `2027`).
  - Concurrent-writer race: two simultaneous `issueCreditNote` calls yield one document and the counter is not over-incremented.
  - Counter rollback when `invoicingRepository.insertCreditNote` rejects (spied).
  - No credit note when no `succeeded` payment exists to refund.

## Relationships

- **`src/modules/invoicing/services/issue-credit-note.ts`** (via `services/index.ts` export) – the service under test; called directly in the idempotency, timezone, race, and rollback cases.
- **`src/modules/invoicing/module.ts`** – registered in `beforeEach`; its `PAYMENT_REFUNDED` subscription is the primary code path exercised by the event-driven cases.
- **`src/modules/invoicing/repository.ts`** – read side (`findInvoiceByOrderId`, `findCreditNotesByOrderId`) and spy target (`insertCreditNote`).
- **`src/modules/invoicing/model.ts`** – `creditNoteNumberCounterModel` queried directly to assert counter state after race/rollback scenarios.
- **`src/modules/invoicing/pii.ts`** – `decryptInvoiceParty` used to verify that the buyer address is re-encrypted under the credit-note document id.
- **`src/kernel/events.ts`** – `resetDomainEvents` in `afterEach` to prevent event leakage between tests.
- **`src/kernel/registry.ts`** – `registerModules` in `beforeEach` to wire all module subscriptions.
- **`src/modules/payments/index.ts`** – `createIntent`, `confirmPayment`, `refundForOrder`, `paymentService` drive the payment lifecycle that triggers the event.
- **`src/modules/orders/index.ts` / `config.ts` / `domain/shop-time.ts`** – `shopTimezone` and `yearInZone` used in the timezone and counter assertions.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` for order fixture creation.
- **`src/modules/inventory/module.ts`** – registered (required by the orders module's dependency chain).

## Notes

- The event-driven cases intentionally go through `refundForOrder` / `paymentService.refundByOrder` to exercise the real subscription; they never call `issueCreditNote` directly. The service is invoked directly only in cases that test its contract (idempotency, race, rollback, timezone).
- `waitUntil` exists because the module's listener is asynchronous and fire-and-forget; a simple `await` on the refund is insufficient to guarantee the listener's write has landed.
- The "burns no number" and "gives the number back" tests assume a transactional counter: the sequence increment is part of the same unit of work as the insert and rolls back with it.
- The timezone test uses `freezeDate` from `@tests/clock` and restores real timers in a `finally` block; without this, the number would reflect UTC year rather than the shop's local year.
- Same printed number on an invoice and its credit note is expected (independent series); the link is proven by `invoiceId`/`invoiceNumber` matching.
