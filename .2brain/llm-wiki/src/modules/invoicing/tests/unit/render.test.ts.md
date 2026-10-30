---
source: src/modules/invoicing/tests/unit/render.test.ts
sha256: 4eb16c1c86a95e2de445a71bbf2168202f71eb80ffe0acd246727da483819738
generated_at: 2026-10-29T04:18:51.110942+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/render.test.ts

## Purpose

Unit tests for the invoice and credit-note PDF render service. The e-invoicing provider (the actual PDF generator) is mocked out; the document store is real (a temporary directory). The tests verify the caching and resilience contract: a second download streams the stored file, retention `0` bypasses storage, and store failures never block a download.

## Key elements

- **`renderInvoicePdf` / `renderCreditNotePdf`** (imported from `../../services/render`) — the functions under test.
- **`issue`** — a module-level `jest.fn` standing in for the provider's PDF-generation call. Re-implemented in `beforeEach` to return a distinct body per call (`pdf-1`, `pdf-2`, …) so "the stored copy" and "a fresh render" are distinguishable.
- **`anInvoice(id)` / `aCreditNote(id)`** — helper factories that build minimal, frozen document objects via `asStub`.
- **`storedNames()`** — helper that lists (sorted) the files in the temp store directory.
- **`beforeEach` / `afterEach`** — create and remove a `mkdtemp` directory under `os.tmpdir()`, set `NODE_DOCUMENT_STORE_PATH` and `NODE_INVOICE_PDF_RETENTION_DAYS` via `setEnvironment`.
- **`jest.mock('../../providers', …)`** — replaces `resolveEInvoicingProvider` so no Chromium/PDF engine is needed.
- **`jest.mock('@infrastructure/adapters/document-store', …)`** — spreads the real module then wraps `readDocument` and `writeDocument` in `jest.fn(realImpl)` so individual tests can call `.mockRejectedValueOnce` without breaking the others.
- **Three `describe` blocks** — "the stored copy of a rendered invoice" (caching, id uniqueness, credit-note coexistence, re-render after deletion), "a retention of 0" (no files written), "a store that fails" (download still succeeds on write or read failure).

## Relationships

- **`src/modules/invoicing/services/render.ts`** — the code under test; exports the two render functions.
- **`src/modules/invoicing/model.ts`** — source of the `InvoiceDocument` and `CreditNoteDocument` types used in the stub helpers.
- **`src/infrastructure/adapters/document-store.ts`** — the real file-backed store. The test mocks it only to intercept `readDocument`/`writeDocument` with `jest.fn` for selective failure; default behaviour delegates to the actual implementation.
- **`tests/support/environment.ts`** — provides `setEnvironment` to point the store at the temp dir and set retention.
- **`tests/support/stub.ts`** — provides `asStub` for creating frozen document literals.

## Notes

- The document-store mock uses `jest.mock` with `jest.requireActual` rather than `jest.spyOn` because `spyOn` cannot redefine a namespace-import getter under the project's swc transform in mutation runs (see `tests/support/ports.ts`).
- The `issue` mock's per-call counter means any assertion that compares `first` vs `second` buffer contents is relying on `pdf-1` ≠ `pdf-2`; a regression that accidentally calls `issue` twice on the "second" download would be caught by the `toHaveBeenCalledTimes(1)` guard as well.
- Store file naming convention asserted: `invoice-<24-char-id>.pdf` and `credit-note-<24-char-id>.pdf`.
