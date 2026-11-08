---
source: src/modules/invoicing/tests/unit/render.test.ts
sha256: 8054d61fce67a64249b8162341d3e7b4543956f8882dc3c50bdde2f10db00bf6
generated_at: 2026-11-08T06:19:13.221294+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/render.test.ts

## Purpose

Unit tests for the invoice and credit-note PDF rendering service. The e-invoicing provider is fully mocked (no Chromium), while the document store is real (backed by a per-test temp directory), so the assertions target the caching and resilience behaviour that matters in production: the second download returns the stored file, `retention 0` stores nothing, and a failing store never breaks the download.

## Key elements

- **`issue` (module-level `jest.fn`)** – replaces the provider's `issue` method; returns a distinct `Buffer` per call so tests can tell a fresh render apart from a stored replay.
- **`jest.mock('../../providers', …)`** – stubs `resolveEInvoicingProvider` to return an object whose `issue` delegates to the `issue` mock.
- **`jest.mock('@infrastructure/adapters/document-store', …)`** – spreads the real module, then wraps `readDocument` and `writeDocument` in `jest.fn(actual.…)` pass-throughs so individual calls can be made to reject.
- **`beforeEach` / `afterEach`** – creates a unique temp dir via `mkdtemp`, sets `NODE_DOCUMENT_STORE_PATH` and `NODE_INVOICE_PDF_RETENTION_DAYS` env vars, resets `issue`; tears down the dir with `rm`.
- **`storedNames()`** – helper that reads the temp dir and returns sorted file names.
- **`anInvoice(id)` / `aCreditNote(id)`** – build minimal `InvoiceDocument` / `CreditNoteDocument` stubs via `asStub` with a fixed `SELLER` block.
- **`describe('the stored copy of a rendered invoice', …)`** – four tests: cache-hit on second call, unique filename per document id, coexistence of invoice + credit note in the same store, re-render after file is deleted.
- **`describe('a retention of 0', …)`** – verifies `issue` is called every time and no file lands in the store.
- **`describe('a store that fails', …)`** – makes `writeDocument` or `readDocument` reject once and asserts the PDF bytes are still returned.

## Relationships

- **`src/modules/invoicing/services/render.ts`** – the unit under test; `renderInvoicePdf` and `renderCreditNotePdf` are the functions exercised by every test case.
- **`src/infrastructure/adapters/document-store.ts`** – mocked as pass-throughs; `readDocument` / `writeDocument` are individually rejected in the resilience tests.
- **`src/modules/invoicing/model.ts`** – supplies the `InvoiceDocument` and `CreditNoteDocument` types that shape the test fixtures.
- **`tests/support/environment.ts`** – `setEnvironment` sets `NODE_DOCUMENT_STORE_PATH` and `NODE_INVOICE_PDF_RETENTION_DAYS` per test.
- **`tests/support/stub.ts`** – `asStub` constructs the frozen document objects used as inputs.

## Notes

- The `documentStore` mock deliberately uses `jest.fn(actual.…)` spread rather than `jest.spyOn` on the namespace import; a comment in the file explains that `jest.spyOn` cannot redefine a namespace-import getter under the project's SWC transform (see `tests/support/ports.ts` for the same pattern).
- The provider mock is at module level (`jest.mock` in the import section), not inside a `describe`, so it applies to the whole file.
- `issue` returns incrementing bodies (`pdf-1`, `pdf-2`, …) specifically so "the stored file" and "a fresh render" produce different strings, making cache-hit assertions unambiguous.
- File naming convention under test: `invoice-{_id}.pdf` and `credit-note-{_id}.pdf` in the same directory.
