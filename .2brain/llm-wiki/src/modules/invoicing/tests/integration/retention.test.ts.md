---
source: src/modules/invoicing/tests/integration/retention.test.ts
sha256: 33dbc5a9a93a84114c4be95e8f8dda7d6f4fdb7e0bb8c32fd9a642ad10f5d902
generated_at: 2026-10-29T04:18:04.410134+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/retention.test.ts

## Purpose

End-to-end integration tests for the `invoicingService.eraseDueBuyers` ("reap:invoices") operation. They verify that an invoice or credit note has its buyer block (`billingAddress`) blanked exactly when the tax retention window (issue year + 11, evaluated in the stored timezone) has elapsed, that the cached PDF is removed, that no other field is touched, and that a second run is a no-op.

## Key elements

- **`invoiceIssuedAt(issuedAt, timezone?)`** – Full-chain fixture: creates a user, a €10 product, an order with a billing address, marks it paid, waits for the invoice, then overwrites `issuedAt`/`timezone` to the desired values. Returns `{ orderId, invoiceId }`.
- **`invoiceBuyer(id)` / `creditNoteBuyer(id)`** – Thin readers that return only the `billingAddress` sub-document from the Mongoose models.
- **`describe('reap:invoices')`** – Six test cases:
  - *Boundary precision* – buyer survives at 22:59 local, is gone at 23:30; `buyerErasedAt` is stamped; report shape `{ invoices: 1, creditNotes: 0 }`.
  - *Timezone year rollover* – a Dec 31 23:30 UTC invoice in `Europe/Rome` counts into the next calendar year, so retention has not yet expired.
  - *Field preservation* – all other columns and `sumInvoices` totals are unchanged after erasure.
  - *Credit-note independence* – a credit note issued in 2020 is not erased when only the 2015 invoice is due.
  - *PDF cleanup* – the erased invoice's cached PDF file is deleted from the document store; unrelated PDFs remain.
  - *Idempotency* – a second `eraseDueBuyers` call reports `{ invoices: 0, creditNotes: 0 }`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/invoicing/services/index.ts` | **SUT** – `invoicingService.eraseDueBuyers` is the function under test. |
| `src/modules/invoicing/model.ts` | `invoiceModel` / `creditNoteModel` read and seed document state. |
| `src/modules/invoicing/repository.ts` | `invoicingRepository.sumInvoices` used to assert stats totals are unaffected. |
| `src/modules/invoicing/tests/factories.ts` | Provides `issueCreditNote` and `waitForInvoice` helpers. |
| `src/modules/orders/index.ts` | `orderService.markPaid` triggers invoice creation. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` build the order fixture. |
| `src/infrastructure/adapters/document-store.ts` | `writeDocument` seeds PDF files; `readdir` on the temp root verifies deletion. |
| `src/kernel/registry.ts` | `registerModules` wires all modules in `beforeEach`. |
| `src/kernel/events.ts` | `resetDomainEvents` clears the event bus in `afterEach`. |
| `src/modules/invoicing/module.ts`, `src/modules/orders/module.ts`, `src/modules/products/module.ts`, `src/modules/inventory/module.ts` | Registered as peer modules so the order→invoice pipeline functions. |

## Notes

- The retention rule is **local New Year of (issue year + 11)** in the invoice's stored `timezone` field, not UTC. The default fixture timezone is `Europe/Rome`; the year-rollover test specifically confirms that 23:30 UTC on Dec 31 is already Jan 1 in Rome.
- `buyerErasedAt` is a dedicated timestamp field set at erasure time; it does not overwrite `updatedAt`.
- The document store path is a real OS temp directory (`mkdtemp`), configured via `setEnvironment({ NODE_DOCUMENT_STORE_PATH: root })`, so PDF deletion is tested against the actual filesystem adapter rather than a mock.
- PDF filenames follow the convention `invoice-<mongoId>.pdf`.
- The test relies on `@tests/setup-test-db` (Mongoose in-memory) called once at module load; module registration is repeated per test.
