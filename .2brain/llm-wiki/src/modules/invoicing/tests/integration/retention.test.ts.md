---
source: src/modules/invoicing/tests/integration/retention.test.ts
sha256: 68e814bd6b2d566904e4326da117ed985804b8304d3e4ddb5f4170e6778d2316
generated_at: 2026-11-08T06:18:20.351588+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/retention.test.ts

## Purpose

Integration test for the `reap:invoices` buyer-erasure job. Verifies the full end-to-end behavior of `invoicingService.eraseDueBuyers`: once an invoice or credit note passes its tax-retention deadline (local New Year of issue-year + 11), its `billingAddress` is blanked, its cached PDF is deleted, all other fields and aggregate stats are untouched, and a second run is a no-op.

## Key elements

- **`invoiceIssuedAt(issuedAt, timezone?)`** – Helper that creates a user, product, paid order with a billing address, waits for the auto-issued invoice, then overwrites `issuedAt`/`timezone`. Returns `{ orderId, invoiceId }`.
- **`invoiceBuyer(id)` / `creditNoteBuyer(id)`** – Read-only helpers that return the `billingAddress` subdocument (or `undefined`).
- **`describe('reap:invoices')`** – Six test cases:
  - Boundary: buyer survives at 22:59 UTC, erased at 23:30 UTC (local New Year in `Europe/Rome`).
  - Timezone year-rollover: a 31 Dec 23:30 UTC invoice is still "this year" in Rome, so it is *not* erased six months later.
  - Field & stats preservation: all non-buyer fields and `sumInvoices` totals are unchanged.
  - Credit-note independence: a credit note keeps its own `issuedAt`-based retention clock.
  - PDF cleanup: only the erased invoice's PDF file is removed from the document store.
  - Idempotency: a second call returns `{ invoices: 0, creditNotes: 0 }`.
- **`beforeEach` / `afterEach`** – Registers all five modules, creates a per-test `mkdtemp` directory for the document store, resets domain events, and removes the temp dir.

## Relationships

- **`src/modules/invoicing/services/index.ts`** – Primary SUT: `invoicingService.eraseDueBuyers` is invoked in every test.
- **`src/modules/invoicing/model.ts`** – `invoiceModel` and `creditNoteModel` are queried to assert post-erasure state.
- **`src/modules/invoicing/repository.ts`** – `invoicingRepository.sumInvoices` is called to confirm aggregate stats survive the erasure.
- **`src/modules/invoicing/services/issue-credit-note.ts`** – Exposed via the test factory `issueCreditNote` to create a credit note for the retention-clock test.
- **`src/modules/invoicing/tests/factories.ts`** – Supplies `issueCreditNote` and `waitForInvoice` helpers.
- **`src/kernel/registry.ts`** – `registerModules` wires all domain modules into the in-memory registry per test.
- **`src/kernel/events.ts`** – `resetDomainEvents` clears the event bus in `afterEach`.
- **`src/infrastructure/adapters/document-store.ts`** – `writeDocument` creates fake PDF files that the erasure job is expected to delete.
- **`src/modules/orders/index.ts`** – `orderService.markPaid` triggers the auto-invoice flow.
- **`src/modules/orders/tests/factories.ts`** – `createOrder` / `toOrderItem` build the order fixture.
- **`src/modules/products/module.ts`**, **`src/modules/inventory/module.ts`**, **`src/modules/orders/module.ts`**, **`src/modules/invoicing/module.ts`** – All registered in `beforeEach`; their services/models are transitively exercised by the order→invoice pipeline.

## Notes

- The retention rule is **local-time** based: the deadline is Jan 1 of (issue-year + 11) in the invoice's own `timezone`. The Rome-vs-UTC boundary tests exist to catch implementations that compare only UTC dates.
- `setupTestDb()` runs once at module scope (not per test), so the test suite shares a single database lifecycle.
- The document-store path is a fresh `mkdtemp` per test, meaning PDF-deletion assertions are isolated and won't see leftover files.
- The `buyerErasedAt` timestamp is set to the *current* time passed to `eraseDueBuyers`, not to the retention deadline itself—assertions compare against the call argument.
