---
source: src/infrastructure/adapters/document-store.ts
sha256: 714227e946ece156a953aeccf1d79c20c3fd1e71d7eb6a1930d7ffc89f59810d
generated_at: 2026-10-29T01:53:27.019105+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/document-store.ts

## Purpose

Disk cache for finished PDF documents (invoices, credit notes). A second download streams the stored file instead of re-launching Chromium to render. The stored PDF is a regenerable copy, not the legal record (that lives in Mongo), is never backed up, and is deleted after its retention window expires.

## Key elements

- **`readDocument(name)`** — Returns the PDF's bytes or `undefined` if absent or if `name` doesn't match the store's shape. `ENOENT` is treated as a normal miss, not an error.
- **`writeDocument(name, bytes)`** — Atomically writes a PDF (temp file in same directory, then rename over the final name) so concurrent readers never see a partial file. Rejects names that don't match `NAME_PATTERN`.
- **`reapDocuments(retentionMs)`** — Deletes every stored PDF whose mtime is at or before the retention edge. Used by the nightly `reap:invoice-pdfs` job. Retention is keyed to *render* time (mtime), not last download.
- **`removeDocument(name)`** — Deletes a single PDF immediately. Absent file counts as success (may never have been rendered, or the reaper already ran).
- **`NAME_PATTERN`** (`/^\w-]{1,80}\.pdf$/`) — The only name shape the store accepts; anything else is rejected at the boundary, preventing path traversal.
- **`documentRoot()`** (internal) — Resolves the storage directory from `pdfConfig().NODE_DOCUMENT_STORE_PATH`.

## Relationships

- **`src/infrastructure/adapters/config.ts`** — Source of `pdfConfig()` which supplies `NODE_DOCUMENT_STORE_PATH`.
- **`src/infrastructure/adapters/filesystem.ts`** — Provides the low-level primitives this module composes: `writeFileAtomically`, `reapDirectory`, `unlinkIfPresent`, and the `ReapResult` type.
- **`src/modules/invoicing/services/render.ts`** — Caller of `readDocument`/`writeDocument`: checks the cache before rendering, writes the result back after.
- **`src/modules/invoicing/services/retention.ts`** — Caller of `reapDocuments` and/or `removeDocument` for lifecycle enforcement.
- **`src/modules/invoicing/jobs.ts`** — Schedules the nightly reap job that invokes `reapDocuments`.
- **`tests/unit/infrastructure/adapters/document-store.test.ts`** — Unit tests for this module's public API.
- **`src/modules/invoicing/tests/unit/render.test.ts`**, **`src/modules/invoicing/tests/integration/retention.test.ts`** — Higher-level tests that exercise the store through the invoicing domain.

## Notes

- A PDF re-rendered after its file was reaped uses the **current** template; the printed numbers don't change, but the visual layout may.
- Files are intentionally stored **plaintext** on disk; at-rest protection is the host's responsibility (same model as Mongo data files).
- The store directory must live **outside** `NODE_PUBLIC_PATH` (it holds personal/financial data).
- `writeDocument` accepts `Buffer | Uint8Array`, not just `Buffer`.
- The `NODE_DOCUMENT_STORE_PATH` default is dev-only; production deployments must mount a volume at that path.
