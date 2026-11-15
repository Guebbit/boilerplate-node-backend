---
source: src/modules/invoicing/tests/unit/render.test.ts
sha256: 45bcdb09a953e61caf2d7511725afdfd3a34f7211e95d29606b4be71032a80f6
generated_at: 2026-11-14T20:16:52.429144+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/render.test.ts

## Purpose
Unit tests for the invoice and credit-note PDF rendering service (`renderInvoicePdf` / `renderCreditNotePdf`). The provider is mocked (no Chromium), while the document store runs against a real temp directory, so the assertions target caching semantics: the second download streams the stored file, retention `0` stores nothing, and a failing store never prevents a successful render.

## Key elements
- **`renderDocument`** — module-level `jest.fn` that stands in for the provider's `render` method; returns a distinct `Buffer` (`pdf-1`, `pdf-2`, …) per call so fresh renders are distinguishable from stored copies.
- **`anInvoice(id)` / `aCreditNote(id)`** — minimal fixture factories (via `asStub`) carrying only the fields the renderer reads.
- **`storedNames()`** — helper that returns the sorted file names currently in the temp directory.
- **`SELLER`** — frozen seller block shared by both fixtures.
- **Three `describe` blocks** — *stored copy of a rendered invoice*, *a retention of 0*, *a store that fails* — covering caching, naming, credit-note isolation, re-renders after deletion, zero-retention, and write/read failure resilience.

## Relationships
- **`src/modules/invoicing/services/render.ts`** — the module under test; `renderInvoicePdf` and `renderCreditNotePdf` are the SUT.
- **`src/modules/invoicing/model.ts`** — provides the `InvoiceDocument` and `CreditNoteDocument` types used to shape fixtures.
- **`src/infrastructure/adapters/document-store.ts`** — the real implementation runs against a temp directory; its `readDocument`/`writeDocument` are intercepted at module-mock level so individual tests can inject failures (see Notes).
- **`tests/support/environment.ts`** — `setEnvironment` configures `NODE_DOCUMENT_STORE_PATH` and `NODE_INVOICE_PDF_RETENTION_DAYS` per test.
- **`tests/support/stub.ts`** — `asStub` creates the typed fixture objects.

## Notes
- The document-store mock spreads `jest.requireActual` and then overrides `readDocument`/`writeDocument` with spy wrappers. The file comment explains why: `jest.spyOn` cannot redefine a namespace-import getter under the SWC transform used in the mutation run (see `tests/support/ports.ts`).
- Each test gets a fresh `mkdtemp` directory; `afterEach` removes it. There is no shared state between tests.
- The provider mock (`../../providers`) is set up with `jest.mock` at module level; `renderDocument` is `mockReset()`'d in `beforeEach` so call-count assertions are per-test.
- Document IDs are fixed-length hex-like strings (24 chars) chosen to match the store's naming convention (`invoice-<id>.pdf`, `credit-note-<id>.pdf`).
