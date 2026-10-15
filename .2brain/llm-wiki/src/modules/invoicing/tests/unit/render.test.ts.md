---
source: src/modules/invoicing/tests/unit/render.test.ts
sha256: 000934dfe989a029bc80f968e22404622372d5d27be46a034e64681b0d5fd349
generated_at: 2026-10-15T10:40:57.368728+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/render.test.ts

## Purpose

Unit tests for the invoice and credit-note PDF rendering service. It exercises `renderInvoicePdf` / `renderCreditNotePdf` against a **real** file-backed document store (a temp directory) while replacing the e-invoicing provider (no Chromium). The assertions target three behaviours: the second render streams the stored file instead of re-issuing, a retention of `0` stores nothing, and a store that throws never turns a download into a failure.

## Key elements

- **`renderInvoicePdf` / `renderCreditNotePdf`** — imported from `../../services/render`; the functions under test.
- **`issue`** (`jest.fn()`) — stand-in for the e-invoicing provider's single method. Each call returns a distinct `Buffer` (`pdf-1`, `pdf-2`, …) so tests can tell a fresh render from a cached one.
- **`anInvoice(id)` / `aCreditNote(id)`** — factory helpers that wrap a minimal object with `asStub` to satisfy the `InvoiceDocument` / `CreditNoteDocument` types without a full model.
- **`storedNames()`** — lists the temp store directory (sorted) to assert what was persisted.
- **Module mock of `../../providers`** — replaces `resolveEInvoicingProvider` with a one-liner that delegates to `issue`.
- **Module mock of `@infrastructure/adapters/document-store`** — spreads `jest.requireActual` and re-wraps `readDocument` / `writeDocument` as `jest.fn` so individual tests can reject them.
- **Three `describe` blocks** — stored-copy semantics (cache hit, unique names, co-located credit notes, re-render after deletion), retention `0` (no file on disk, provider called every time), and store failure (write/read rejection still yields PDF bytes).
- **`beforeEach` / `afterEach`** — create and remove a unique `mkdtemp` directory; set `NODE_DOCUMENT_STORE_PATH` and `NODE_INVOICE_PDF_RETENTION_DAYS` via `setEnvironment`.

## Relationships

- **`src/modules/invoicing/services/render.ts`** — the code under test; both render functions are called directly.
- **`src/infrastructure/adapters/document-store.ts`** — mocked at module level; `readDocument` and `writeDocument` are spied so individual tests can force failures while the rest of the module (path resolution, etc.) runs for real.
- **`src/modules/invoicing/model.ts`** — type-only imports (`InvoiceDocument`, `CreditNoteDocument`) used by the `asStub` factory helpers.
- **`tests/support/environment.ts`** — `setEnvironment` configures the temp store path and retention days per test.
- **`tests/support/stub.ts`** — `asStub` casts minimal literals to the document types.

## Notes

- The document-store mock uses `jest.requireActual` + `jest.fn` spread rather than `jest.spyOn` on the namespace import, because `spyOn` cannot redefine a namespace-import getter under the project's SWC transform (see `tests/support/ports.ts`).
- The provider mock returns a **different** byte string per call (`pdf-1`, `pdf-2`, …). This is essential: tests rely on the bytes to prove whether a render came from disk or from the provider.
- Retention is controlled entirely by the `NODE_INVOICE_PDF_RETENTION_DAYS` environment variable (set per test), not by a constructor argument.
- The store path is a real temp directory on disk, not an in-memory fake — this is deliberate so the test exercises the actual `readFile`/`writeFile` paths.
