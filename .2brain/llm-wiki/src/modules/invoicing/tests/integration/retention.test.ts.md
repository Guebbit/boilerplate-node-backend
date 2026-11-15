---
source: src/modules/invoicing/tests/integration/retention.test.ts
sha256: 91de8b0904c222972978e0a6ade27788b8974115aa6bca9b27fe46055a45a138
generated_at: 2026-11-14T20:16:32.449389+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/integration/retention.test.ts

## Purpose

Integration test for the `reap:invoices` retention job. Verifies that once an invoice or credit note passes its tax retention window (local New Year of issue year + 11), the buyer block (`billingAddress`) is blanked, the cached PDF is deleted from the document store, all other fields remain untouched, and a second run is a no-op.

## Key elements

- **`invoiceIssuedAt(issuedAt, timezone)`** — Helper that creates a user, product, paid order with a billing address, waits for the invoice, then back-dates `issuedAt`/`timezone` directly on the model. Returns `{ orderId, invoiceId }`.
- **`invoiceBuyer(id)` / `creditNoteBuyer(id)`** — Thin Mongoose readers that return the `billingAddress` field of an invoice or credit note, used in assertions.
- **`describe('reap:invoices')`** — Six test cases covering:
  - Boundary: buyer erased at exactly the retention deadline, not a minute before.
  - Timezone: a 23:30 UTC stamp in `Europe/Rome` rolls into the next calendar year.
  - Field preservation: all non-buyer fields and `sumInvoices` totals are unchanged.
  - Credit notes: erased on their own `issuedAt`, independent of the parent invoice.
  - PDF cleanup: only the erased document's PDF is removed from disk.
  - Idempotency: a second run reports zero changes.

## Relationships

- **`src/modules/invoicing/services/index.ts`** — Exports `invoicingService`, the retention-erase service that is the primary subject under test.
- **`src/modules/invoicing/model.ts`** — `invoiceModel` and `creditNoteModel` are read/written directly for setup and assertions.
- **`src/modules/invoicing/repository.ts`** — Exports `invoicingRepository`, used to confirm aggregate stats survive the erase.
- **`src/modules/invoicing/services/issue-credit-note.ts`** — `issueCreditNote` creates the credit note fixture.
- **`src/modules/invoicing/tests/factories.ts`** — Provides `waitForInvoice` (polls for the auto-created invoice) and `issueCreditNote` wrapper.
- **`src/modules/orders/friends/payments.ts`** — `markPaid` finalizes the order so the invoicing pipeline fires.
- **`src/modules/orders/tests/factories.ts`** — `createOrder` / `toOrderItem` build the order fixture.
- **`src/modules/products/module.ts`**, **`src/modules/inventory/module.ts`**, **`src/modules/orders/module.ts`**, **`src/modules/invoicing/module.ts`** — All registered via `registerModules` to satisfy cross-module dependencies.
- **`src/kernel/registry.ts`** — `registerModules` bootstraps the in-test module graph.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the event bus between tests.
- **`src/infrastructure/adapters/document-store.ts`** — `writeDocument` seeds a fake PDF in the temp directory; the test then asserts it was deleted by the retention job.

## Notes

- The retention rule is **issue year + 11 local calendar years** (i.e., the buyer block is eligible on the first instant of year `issuedYear + 11` in the invoice's `timezone`). The boundary test pins this with a 22:59 vs 23:30 UTC pair in `Europe/Rome`.
- A document stamped `2015-12-31T23:30:00Z` in `Europe/Rome` is treated as **2016**-issued locally, pushing its retention deadline a full year later — a common timezone gotcha this test guards against.
- The document-store path is a per-test `mkdtemp` directory set via `setEnvironment({ NODE_DOCUMENT_STORE_PATH: root })`; cleanup uses `rm(recursive, force)` in `afterEach`.
- `setupTestDb()` runs once at module scope, outside `beforeEach`.
- The "field preservation" test strips `updatedAt` from both sides of a deep-equality check because Mongoose auto-updates it on write.
