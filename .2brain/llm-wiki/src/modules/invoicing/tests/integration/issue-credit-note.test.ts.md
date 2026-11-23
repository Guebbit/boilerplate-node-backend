---
source: src/modules/invoicing/tests/integration/issue-credit-note.test.ts
source_sha256: 0237044b77f446abcd482f12bc1463d13ac9dff24a2aee0bb838e39e1920e38b
context_sha256: 9b8019add8b771d5905847c9ea76e5bef5d8032442382466c98ed700146dfd17
generated_at: 2026-11-22T05:38:45.514145+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/integration/issue-credit-note.test.ts

## Purpose
End-to-end integration test for credit-note issuance in the invoicing module. A credit note is only ever frozen when a refund settles on a `succeeded` payment, so the tests drive the real `payments` flow (`refundForOrder` / `refundOrderPayment`) and the real `PAYMENT_REFUNDED` subscription in `src/modules/invoicing/module.ts`. `issueCreditNote` is called directly only for edge cases (idempotency, races, year numbering, seller snapshot, failure rollback).

## Key elements
- **`setupTestDb()` / `beforeEach` / `afterEach`**: set up the test DB, register the `users`, `products`, `inventory`, `orders`, `payments` and `invoicing` modules via `registerModules`, and call `resetDomainEvents()` after each test.
- **`FAKE_SUCCESS_METHOD`** (`'pm_card_visa'`): the fake PSP's "always succeeds" payment method reference.
- **`paidAndInvoiced(overrides)`**: helper that creates a user, a 25.00 product and an order, creates and confirms a payment intent through `paymentService`, then waits for the invoice. It returns `{ orderId, invoice }`.
- **`waitForNotes(orderId, count)`**: polls with `eventually` until the order has at least `count` credit notes, then returns them from the invoicing repository.
- **Test cases** (in `describe('issuing a credit note off PAYMENT_REFUNDED')`):
  - The note is numbered in its own series (`YYYY-NNNNNN`) and links to the invoice via `invoiceId` and `invoiceNumber`, with the same `grandTotal`.
  - The buyer address is re-encrypted under the credit note's own id. It is verified with `decryptInvoiceParty(..., 'credit-note', note._id)`.
  - A full refund mirrors the invoice's lines and totals.
  - Each partial refund (20.00, then 5.00) gets its own note, number and `refundId`, and net + tax reconciles to gross.
  - Idempotency: calling `issueCreditNote` again for the same `refundId` returns the existing note and creates no duplicate.
  - The number uses the shop's calendar year, not UTC's: a frozen date of 2026-12-31T23:30Z yields `2027-000001`.
  - The seller is copied from the invoice, not from current environment settings changed via `setEnvironment`.
  - Race: two concurrent `issueCreditNote` calls for one refund yield one note, one `credit_note_issued` timeline row, and a counter equal to the note count (no burnt number).
  - Failure rollback: if `insertCreditNote` rejects (spied), the error propagates and the number counter document is absent.
  - An order with no invoice (status `paid` set directly) is expected to issue nothing and burn no number. The file's visible content ends partway through this test.

## Relationships
- **`src/modules/invoicing/services/issue-credit-note.ts`**: the unit under test, called directly for the idempotency, year, seller, race, failure and no-invoice cases.
- **`src/modules/invoicing/repository.ts`**: `invoicingRepository` reads the results, and `insertCreditNote` is spied on to force a failure.
- **`src/modules/invoicing/model.ts`**: `creditNoteNumberCounterModel` is read to assert counter state.
- **`src/modules/invoicing/pii.ts`**: `decryptInvoiceParty` verifies the re-encrypted buyer address.
- **`src/modules/invoicing/module.ts`, `src/modules/payments/module.ts`, `src/modules/orders/module.ts`, `src/modules/inventory/module.ts`**: registered so the real event subscriptions run. `src/modules/payments/index.ts` provides `paymentService`.
- **`src/kernel/registry.ts`, `src/kernel/events.ts`**: `registerModules` and `resetDomainEvents`.
- **`src/domain-primitives/time.ts`**: `yearInZone` computes the expected counter key.
- **`src/modules/invoicing/tests/factories.ts`**: `waitForInvoice`.
- **`src/modules/orders/tests/factories.ts`**: `createOrder`, `toOrderItem`, `timelineOf`.
- **`src/modules/payments/services/index.ts`**: related neighbor in the graph. The visible code does not show a direct import from it.

## Notes
- Credit notes and invoices have independent number series, both restarting each year at 1. The same printed number on both documents is expected, and only `invoiceId` / `invoiceNumber` link them.
- Tests that freeze time use `freezeDate` with `try/finally` and `jest.useRealTimers()`.
- Mongoose subdocuments are compared via `toObject()` because `toEqual` cannot walk them.
- Comments cite legal grounds for the design, such as a note mirroring the invoice's seller (AdE 427/2023, VAT Directive Art. 226(3)) and no document for money that never paid for a sale.
- The dead-invoice-event case is covered separately in `credit-note-catch-up.test.ts`.
