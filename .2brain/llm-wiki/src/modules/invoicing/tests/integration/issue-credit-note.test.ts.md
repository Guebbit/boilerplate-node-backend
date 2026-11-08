---
source: src/modules/invoicing/tests/integration/issue-credit-note.test.ts
sha256: 0c92e2196fd3b939ca267810b490ff631c0071cce28d56069071f0b610d573a8
generated_at: 2026-11-08T06:17:26.126781+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/issue-credit-note.test.ts

## Purpose

Integration test verifying that a credit note is frozen **only** when a `PAYMENT_REFUNDED` event settles on a `succeeded` payment, exercised through the real `payments` module's `refundForOrder` and the invoicing module's event subscription—not by calling `issueCreditNote` directly (except in targeted edge-case tests). Covers numbering, PII re-encryption, partial-refund mirroring, idempotency, timezone-aware year, seller preservation, and race/failure rollback.

## Key elements

- **`paidAndInvoiced(overrides?)`** — helper that creates a user, a 25.00 product, an order, confirms a payment via `paymentService`, and waits for the invoice; returns `{ orderId, invoice }`.
- **`waitForNotes(orderId, count)`** — polls `invoicingRepository.findCreditNotesByOrderId` until the expected count is reached (uses `eventually`).
- **`FAKE_SUCCESS_METHOD`** (`'pm_card_visa'`) — the fake PSP's always-succeeds payment-method reference.
- **`describe('issuing a credit note off PAYMENT_REFUNDED')`** — eight `it` blocks:
  - Numbering format (`YYYY-NNNNNN`), link to parent invoice, grand-total mirroring.
  - Buyer address re-encryption under the credit-note's own `_id` (verified via `decryptInvoiceParty`).
  - Full-refund mirrors invoice lines and totals.
  - Two partial refunds → two credit notes, each with its own number, `refundId`, and cent-exact net+tax reconciliation.
  - Idempotency: re-delivering the same `refundId` returns the existing note, no duplicate.
  - Calendar-year numbering in the **shop** timezone (Rome 00:30 on Jan 1 → year `2027`).
  - Seller block is copied from the invoice, not from current env settings (VAT Directive Art. 226(3)).
  - Concurrent `issueCreditNote` calls for the same refund: one document, one number, counter not over-allocated.
  - Number is rolled back when `insertCreditNote` rejects (counter stays `null`).
  - No invoice → no credit note, no number burned.

## Relationships

- **`src/modules/invoicing/services/issue-credit-note.ts`** — the service under test; called directly in idempotency, timezone, race, failure, and no-invoice tests.
- **`src/modules/invoicing/module.ts`** — registered in `beforeEach`; its `PAYMENT_REFUNDED` subscription is the primary trigger path.
- **`src/modules/invoicing/model.ts`** — provides `creditNoteNumberCounterModel` (inspected in race/failure tests).
- **`src/modules/invoicing/pii.ts`** — `decryptInvoiceParty` used to assert re-encrypted address fields.
- **`src/modules/invoicing/repository.ts`** — `invoicingRepository.findCreditNotesByOrderId` for assertions; `insertCreditNote` spied in the rollback test.
- **`src/modules/invoicing/tests/factories.ts`** — `waitForInvoice` helper.
- **`src/modules/payments/index.ts`** — `paymentService` used to create/confirm the initial payment intent.
- **`src/modules/payments/module.ts`** — registered so its real `refundForOrder` → `PAYMENT_REFUNDED` path fires.
- **`src/kernel/registry.ts`** — `registerModules` wires all six modules per test.
- **`src/kernel/events.ts`** — `resetDomainEvents` in `afterEach`.
- **`src/domain-primitives/time.ts`** — `yearInZone` for the shop-timezone counter key.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `timelineOf`, `toOrderItem`.
- **`src/modules/orders/module.ts`**, **`src/modules/inventory/module.ts`** — registered as upstream dependencies.

## Notes

- The **primary** path (first four tests) never imports or calls `issueCreditNote`; it goes through `refundForOrder` → real module subscription → event handler. The later tests call `issueCreditNote` directly to exercise idempotency, timezone, concurrency, and failure isolation.
- Async assertions use the `eventually` helper (polling), not `waitFor` from Jest—consistent with the codebase's eventual-consistency test convention.
- Numbering is **shop-timezone** aware; the timezone test freezes the clock at `2026-12-31T23:30Z` (Rome is already 2027) to prove `yearInZone` is used, not UTC.
- The race-condition test asserts the `creditNoteNumberCounterModel.seq` equals the **final** note count, confirming the loser's transaction aborts and its allocation is rolled back.
- Seller identity is pinned to the invoice's seller (Italian AdE 427/2023 requirement), not to `NODE_LEGAL_NAME` at credit-note time—`setEnvironment` mutation mid-test proves the isolation.
- `toObject()` is required when comparing Mongoose subdocuments with `toEqual` (plain-object assertion cannot walk `Mongoose` instances).
