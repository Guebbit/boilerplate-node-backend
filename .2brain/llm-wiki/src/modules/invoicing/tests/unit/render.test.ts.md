---
source: src/modules/invoicing/tests/unit/render.test.ts
source_sha256: bcd35ab2d55858ebfa9a70e1204b22dcbdb29758f4aa34f89acffedb96df07a9
context_sha256: ba006924a2a82858df52f2e069d8921cc806dfedeaba5450026090200102f6ad
generated_at: 2026-11-22T05:40:47.178432+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/unit/render.test.ts

## Purpose
Unit tests for `renderInvoicePdf` and `renderCreditNotePdf`, which put a stored copy of the PDF in front of the renderer. The PDF provider is mocked (no Chromium), while the document store is real, backed by a per-test temporary directory. The tests assert the caching behaviour: the second download comes from the stored file, a retention of `0` stores nothing, and a failing store never fails the download.

## Key elements
- `renderDocument` — a `jest.fn()` standing in for the provider's `render`. `jest.mock('../../providers')` makes `resolveEInvoicingProvider` return it. It returns a distinct body per call (`pdf-1`, `pdf-2`, …), so stored and fresh output can be told apart.
- `jest.mock('@infrastructure/adapters/document-store')` — keeps the real module but wraps `readDocument` and `writeDocument` in `jest.fn` pass-throughs, so individual tests can make one of them reject.
- `beforeEach` / `afterEach` — create and remove a temp dir `root`, and set `NODE_DOCUMENT_STORE_PATH` and `NODE_INVOICE_PDF_RETENTION_DAYS` (`'30'`) through `setEnvironment`. They also reset the provider mock.
- `storedNames()` — returns the sorted file names in `root`.
- `SELLER`, `anInvoice(id)`, `aCreditNote(id)` — minimal frozen-document fixtures built with `asStub`.
- Test groups:
  - **Stored copy** — renders once, then streams from disk. Files are named `invoice-<id>.pdf` and `credit-note-<id>.pdf`. A credit note is stored apart from its invoice. The provider receives `reversalOf: { number, reason }` for a credit note. A deleted file triggers a re-render.
  - **Retention `0`** — nothing is written and every call renders.
  - **Failing store** — a rejected write or read still returns the rendered bytes (`pdf-1`).

## Relationships
- `services/render` — the code under test (`renderInvoicePdf`, `renderCreditNotePdf`).
- `infrastructure/adapters/document-store` — the real implementation is used, with `readDocument` and `writeDocument` wrapped as mocks.
- `model` — supplies the `InvoiceDocument` and `CreditNoteDocument` types for the fixtures.
- `tests/support/environment` (`setEnvironment`) — sets the env vars that configure the store path and retention.
- `tests/support/stub` (`asStub`) — builds partial documents typed as the full model.

## Notes
- The store functions are replaced with `jest.fn` wrappers instead of using `jest.spyOn`. `spyOn` cannot redefine a namespace import's getter under the mutation run's swc transform (see `tests/support/ports.ts`).
- The tests treat the store as an optimisation: a full disk or bad mount must not turn a download into a 500.
- The fixtures carry only the fields the renderer reads (`_id`, `number`, `lines`, `seller`, `taxSummary`, plus `invoiceNumber` and `reason` for credit notes).
