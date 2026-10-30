---
source: src/modules/invoicing/tests/integration/issue-credit-note.test.ts
sha256: 2ddd52a31d4b53ac51fd5d2f8f9b9226b7c3ff439bcfca7caaf4c892428a4a53
generated_at: 2026-10-29T04:17:13.500290+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/issue-credit-note.test.ts

## Purpose

Integration test suite that verifies credit-note issuance end-to-end: a refund settling on a `succeeded` payment is the *only* trigger that freezes a credit note. The happy path is exercised through the real `payments` module's `refundForOrder` and the real `invoicing/module.ts` subscription to `PAYMENT_REFUNDED`—never by calling `issueCreditNote` directly. Direct calls are reserved for edge-case tests (idempotency, races, timezone, missing invoice).

## Key elements

- **`FAKE_SUCCESS_METHOD`** – constant (`pm_card_visa`) matching the fake PSP's "always succeeds" payment-method reference.
- **`paidAndInvoiced(overrides?)`** – helper that creates a user → product (€25) → order, confirms a payment via `paymentService`, waits for the invoice, and returns `{ orderId, invoice }`.
- **`waitForNotes(orderId, count)`** – polls `invoicingRepository.findCreditNotesByOrderId` until the expected count is reached.
- **`describe('issuing a credit note off PAYMENT_REFUNDED')`** – the test block containing:
  - number-series independence (credit note and invoice each start at `1` per year)
  - PII re-encryption under the note's own `_id`
  - full-refund mirroring of lines, `grandTotal`, `netTotal`, `taxTotal`
  - one note per partial refund, each with its own `refundId` and number
  - idempotency on redelivered refund events
  - shop-timezone year numbering (not UTC)
  - seller carried from the original invoice even after a shop rename
  - concurrent-writer race producing exactly one document and one counter increment
  - counter rollback on a failed insert (`insertCreditNote` mocked to reject)
  - no note and no number burned when the order has no invoice

## Relationships

- **`src/kernel/registry.ts`** – `registerModules()` in `beforeEach` wires all six modules so the real event pipeline is active.
- **`src/kernel/events.ts`** – `resetDomainEvents()` in `afterEach` clears the event bus between tests.
- **`src/modules/invoicing/module.ts`** – registered in setup; hosts the `PAYMENT_REFUNDED` subscription that is the actual trigger for every happy-path test.
- **`src/modules/invoicing/services/issue-credit-note.ts`** – `issueCreditNote` imported for direct-invocation edge-case tests (idempotency, race, timezone, seller, no-invoice).
- **`src/modules/invoicing/repository.ts`** – `invoicingRepository` used for all credit-note queries, for spying on `insertCreditNote`, and for asserting counter state.
- **`src/modules/invoicing/model.ts`** – `creditNoteNumberCounterModel` queried to verify counter rollback and race-safety.
- **`src/modules/invoicing/pii.ts`** – `decryptInvoiceParty` round-trips the re-encrypted billing address to confirm it was encrypted under the note's `_id`.
- **`src/modules/invoicing/tests/factories.ts`** – `waitForInvoice` polls until the invoice document appears after payment confirmation.
- **`src/modules/payments/index.ts`** – `paymentService` used to create intents and confirm payments in the happy path.
- **`src/modules/orders/index.ts`** – `yearInZone` used to compute the expected year key for counter assertions.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`, `timelineOf` build the order fixture and inspect the order timeline for `credit_note_issued` entries.
- **`src/modules/inventory/module.ts`**, **`src/modules/orders/module.ts`**, **`src/modules/payments/module.ts`** – registered so their subscriptions (e.g. stock deduction, invoice creation on payment) fire during the test.

## Notes

- PII ciphertext on the credit note **differs** from the invoice's even for the same address, because encryption is keyed to the note's own `_id`. Tests must decrypt rather than compare raw strings.
- `toEqual` cannot walk Mongoose subdocuments; the seller-mirroring test uses `.toObject()` before asserting.
- The number format is `YYYY-NNNNNN`; `YYYY` is derived from the shop's IANA timezone (`shopTimezone()`), so a note issued at 23:30 UTC on 31 Dec in a CET shop gets a `2027` prefix.
- The test file references Italian tax obligations (AdE 427/2023, VAT Directive Art. 226(3)) to explain *why* the credit note must carry the original invoice's seller rather than current shop settings.
- The "no invoice" test expects `issueCreditNote` to return `undefined` and leave the counter at `null` for that year—no gap is burned.
