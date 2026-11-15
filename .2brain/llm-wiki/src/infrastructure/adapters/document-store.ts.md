---
source: src/infrastructure/adapters/document-store.ts
sha256: a9338d552f1bdddfd482845a0934f23c670541950994a2385333e8d172c643df
generated_at: 2026-11-14T17:52:50.483128+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/document-store.ts

## Purpose

Disk-backed cache of rendered PDF documents (invoices, credit notes) so that a second download streams an existing file instead of re-launching Chromium. It is explicitly **not** a record store: the authoritative invoice data lives in Mongo, and these PDFs are regenerable copies with a finite retention window.

## Key elements

- **`documentRoot()`** *(private)* — Resolves the absolute directory for stored documents from `pdfConfig().NODE_DOCUMENT_STORE_PATH`.
- **`NAME_PATTERN`** *(private)* — Regex `/^[\w-]{1,80}\.pdf$/`; the only name shape the store will read or write.
- **`resolveName(name)`** *(private)* — Validates a name against `NAME_PATTERN` and returns the joined path, or `undefined` if the name is malformed.
- **`readDocument(name)`** — Returns the PDF bytes, or `undefined` if absent or the name is invalid. Treats `ENOENT` as a normal "not found" rather than an error.
- **`writeDocument(name, bytes)`** — Atomically writes a PDF (temp file in same directory, then rename). Rejects invalid names with a thrown `Error`. Creates the root directory if missing.
- **`reapDocuments(retentionMs)`** — Deletes all stored files last modified before `Date.now() - retentionMs`. Intended for the nightly `reap:invoice-pdfs` job. Returns a `ReapResult`.
- **`removeDocument(name)`** — Deletes a single file. Returns `false` (not an error) if the file is absent or the name is invalid.

## Relationships

- **`src/infrastructure/adapters/config.ts`** — Imports `pdfConfig` to read `NODE_DOCUMENT_STORE_PATH`, the root directory for all stored documents.
- **`src/infrastructure/adapters/filesystem.ts`** — Imports `reapDirectory`, `unlinkIfPresent`, and `writeFileAtomically`; this module delegates all low-level file operations to that adapter.
- **`src/modules/invoicing/jobs.ts`** — Consumes `reapDocuments` as the nightly retention job.
- **`src/modules/invoicing/services/render.ts`** — Calls `readDocument` / `writeDocument` to check for a cached PDF before rendering and to persist the result after rendering.
- **`src/modules/invoicing/services/retention.ts`** — Calls `removeDocument` to delete a specific document ahead of its retention window.
- **`tests/unit/infrastructure/adapters/document-store.test.ts`** — Unit tests for read/write/remove/reap behavior.
- **`src/modules/invoicing/tests/unit/render.test.ts`** — Exercises the render path that reads from / writes to this store.
- **`src/modules/invoicing/tests/integration/retention.test.ts`** — Integration tests covering the reap and remove flows end-to-end.

## Notes

- **Path-traversal guard is name-only.** The regex rejects anything that isn't `\w-` + `.pdf`; no caller-supplied string is ever joined into a path unless it matches. There is no `..` filtering because the pattern excludes `/` and `.` entirely.
- **Plaintext by design.** The PDFs are not encrypted at rest; the module's header states that at-rest protection is the host's responsibility, consistent with the Mongo data files.
- **Retention is by modification time, not access time.** A re-download does not extend a document's life; only re-rendering (which rewrites the file) resets the clock.
- **Re-rendering after reap follows the *current* template.** The numeric data is immutable (from Mongo), but visual layout can shift if the template changed between renders.
- **`writeDocument` rejects invalid names; `readDocument` / `removeDocument` return sentinel values (`undefined` / `false`).** Callers should match the error-handling style they expect.
