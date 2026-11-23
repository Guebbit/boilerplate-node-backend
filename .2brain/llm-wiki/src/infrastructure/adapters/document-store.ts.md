---
source: src/infrastructure/adapters/document-store.ts
source_sha256: 1deb83342d45a0287e120faf321054ace689d607794a84e1974db63f65cf6d7e
context_sha256: ba31758c16bc8ffe54ec802aa5a2fb3f1ffb3b75fb310d588defcc87e558505a
generated_at: 2026-11-22T02:35:51.531268+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/document-store.ts

## Purpose
A small on-disk store for finished PDFs (invoices, credit notes) so a repeat download streams a saved file instead of re-rendering with Chromium. It is a regenerable cache, not a record: the frozen invoice data in Mongo is the legal record, and stored PDFs are never backed up and are deleted after a retention window.

## Key elements
- `readDocument(name)` — returns the file's bytes, or `undefined` if absent (ENOENT) or the name is invalid. Other read errors are rethrown.
- `writeDocument(name, bytes)` — creates the root directory if needed, then writes atomically (temp file in the same directory, renamed over the final name). Rejects with an `Error` for an invalid name.
- `reapDocuments(retentionMs)` — deletes every file last modified at or before `Date.now() - retentionMs`. Used by the nightly `reap:invoice-pdfs` job. Returns a `ReapResult` (files checked and deleted).
- `removeDocument(name)` — deletes one document ahead of retention. An absent file counts as success. Resolves to whether a file was deleted; `false` for an invalid name.
- Internal `documentRoot()` — resolves `pdfConfig().NODE_DOCUMENT_STORE_PATH` on each call.
- Internal `NAME_PATTERN` / `resolveName` — the only accepted name is `/^[\w-]{1,80}\.pdf$/` (for example `invoice-<id>.pdf`). Anything else is never joined onto a path.

## Relationships
- `src/infrastructure/adapters/config.ts` — supplies `pdfConfig()`, from which the store root `NODE_DOCUMENT_STORE_PATH` is read.
- `src/infrastructure/adapters/filesystem.ts` — supplies `writeFileAtomically`, `reapDirectory`, `unlinkIfPresent` and the `ReapResult` type, which do the atomic write, directory reaping and tolerant delete.
- `src/modules/invoicing/jobs.ts`, `src/modules/invoicing/services/render.ts` and `src/modules/invoicing/services/retention.ts` — invoicing-side files in the graph that sit alongside this store. The module doc names the nightly `reap:invoice-pdfs` job as the caller of `reapDocuments`, and the render flow is the read/write path for downloads.
- `tests/unit/infrastructure/adapters/document-store.test.ts`, `src/modules/invoicing/tests/unit/render.test.ts` and `src/modules/invoicing/tests/integration/retention.test.ts` — tests covering the store and its consumers.

## Notes
- The store is outside `NODE_PUBLIC_PATH` because it holds personal and financial data. Files are plaintext on disk by design; at-rest protection is the host's responsibility, as with the Mongo data files.
- A PDF re-rendered after its file was reaped uses the current template, so an old invoice may look different, though the numbers it prints do not change.
- Retention is based on modification time, so a document is kept from when it was rendered, not from its last download.
- The default root is dev-only; a deployment should mount a volume at the configured path.
- Name validation is the path-traversal guard: callers never pass a path, only a short slug ending in `.pdf`.
