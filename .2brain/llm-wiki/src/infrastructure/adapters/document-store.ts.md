---
source: src/infrastructure/adapters/document-store.ts
sha256: 7c312b2c4a2cb86616187abfaafdfe9ea4df4cdd34c85b6ba6784f061baf475f
generated_at: 2026-10-14T07:42:48.225305+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/document-store.ts

## Purpose

Caches finished PDFs (invoices, credit notes) on local disk so a second download streams the stored file instead of re-launching Chromium to re-render. The stored PDF is a regenerable convenience copy, never a legal record — the frozen invoice data in Mongo is the source of truth. Stored files are plaintext, intentionally outside `NODE_PUBLIC_PATH`, and subject to a retention window.

## Key elements

- **`readDocument(name)`** — Returns the stored PDF bytes or `undefined` (file absent or name invalid). Treats `ENOENT` as a normal miss; rethrows any other I/O error.
- **`writeDocument(name, bytes)`** — Atomically stores a PDF: writes to a random-suffixed `.tmp` file in the same directory, then `rename`s over the final name. On failure, unlinks the temp file before rethrowing. Rejects names that don't match the store's own shape.
- **`reapDocuments(retentionMs)`** — Deletes stored PDFs whose modification time is older than the retention window. Returns a `ReapResult` (checked/deleted counts). Backs the nightly `reap:invoice-pdfs` ops script.
- **`NAME_PATTERN`** (`/^[\w-]{1,80}\.pdf$/`) — The only accepted name shape. Guards against path traversal; `resolveName` returns `undefined` for anything else.
- **`documentRoot()`** — Resolves the store directory from `pdfConfig().NODE_DOCUMENT_STORE_PATH`.
- **`resolveName(name)`** — Internal helper: validates against `NAME_PATTERN` then joins to the root.

## Relationships

- **`./filesystem`** — Imports `reapDirectory` (directory-level age-based deletion) and `unlinkIfPresent` (temp-file cleanup on failed writes), plus the `ReapResult` type.
- **`@infrastructure/adapters/config`** — Reads `pdfConfig()` to obtain `NODE_DOCUMENT_STORE_PATH` (the on-disk root).
- **`scripts/ops/reap-invoice-pdfs.ts`** — Ops script that calls `reapDocuments` with a configured retention window.
- **`src/modules/invoicing/services/render.ts`** — Upstream consumer: after rendering a PDF, writes it via `writeDocument` and reads it back via `readDocument` for subsequent downloads.
- **`tests/unit/infrastructure/adapters/document-store.test.ts`** — Unit tests for read/write/reap behavior and name validation.
- **`src/modules/invoicing/tests/unit/render.test.ts`** — Integration-adjacent tests that exercise the render → store → read path.

## Notes

- **Not a record.** A PDF re-rendered after its file is reaped will follow the *current* template layout; the numeric data does not change. Do not treat a stored PDF as a backup.
- **Atomicity guarantee:** readers never see a partial file. The random temp suffix prevents two simultaneous first-downloads from clobbering each other's temp file.
- **Security model:** The name pattern is the sole path-traversal guard. At-rest protection is the host's responsibility (same stance as Mongo data files — see `docs/theory/defences/data-protection.md`).
- **Reaping uses mtime, not access time.** A document is kept from the moment it was *rendered/written*, not from its last download.
- **Dev-only default path.** In production, mount a volume at `NODE_DOCUMENT_STORE_PATH`; the default location is not suitable for real data.
