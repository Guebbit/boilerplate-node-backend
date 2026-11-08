---
source: src/infrastructure/adapters/document-store.ts
sha256: 714227e946ece156a953aeccf1d79c20c3fd1e71d7eb6a1930d7ffc89f59810d
generated_at: 2026-11-08T03:18:19.909315+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/document-store.ts

## Purpose

Caches finished PDFs (invoices, credit notes) on disk so a repeated download streams the file instead of re-launching Chromium. Explicitly **not** the legal record (that lives in Mongo); a stored PDF is a regenerable, non-backed-up copy that expires after a retention window.

## Key elements

- **`readDocument(name)`** — Returns the PDF bytes or `undefined` if absent or the name doesn't match the store's shape. `ENOENT` is treated as "not found"; other errors throw.
- **`writeDocument(name, bytes)`** — Atomic write (temp file + rename via `writeFileAtomically`). Rejects names outside the allowed shape before touching disk.
- **`reapDocuments(retentionMs)`** — Deletes every file whose mtime is older than the cutoff. Called by the nightly `reap:invoice-pdfs` job. Returns a `ReapResult` (counts checked/deleted).
- **`removeDocument(name)`** — Deletes a single file ahead of schedule. Absent file resolves `false` (success), not an error.
- **`NAME_PATTERN`** (`/^[\w-]{1,80}\.pdf$/`) — The only accepted filename shape. Anything else returns `undefined` from `resolveName`, short-circuiting before any path is constructed.
- **`documentRoot()`** — Resolves `pdfConfig().NODE_DOCUMENT_STORE_PATH`. Must sit **outside** `NODE_PUBLIC_PATH`.

## Relationships

- **`./filesystem.ts`** — Provides `reapDirectory`, `unlinkIfPresent`, `writeFileAtomically`, and the `ReapResult` type used by `reapDocuments`.
- **`./config.ts`** — Supplies `pdfConfig()` for the store's root path.
- **`src/modules/invoicing/services/render.ts`** — Produces the PDF bytes that get passed to `writeDocument`; calls `readDocument` to short-circuit re-render.
- **`src/modules/invoicing/services/retention.ts`** — Calls `removeDocument` when an individual invoice is retired early.
- **`src/modules/invoicing/jobs.ts`** — Invokes `reapDocuments` as the nightly bulk-expiry job.
- **Tests** — `tests/unit/infrastructure/adapters/document-store.test.ts` (unit), `src/modules/invoicing/tests/unit/render.test.ts`, `src/modules/invoicing/tests/integration/retention.test.ts`.

## Notes

- Retention is keyed to **mtime** (render time), not last-access time — re-downloading a PDF does **not** extend its life.
- A PDF re-rendered after its file was reaped uses the **current** template, so layout can shift while printed numbers stay the same.
- Plaintext on disk is a deliberate, documented decision; at-rest protection is delegated to the host (same posture as Mongo data files).
- The store never constructs a path from caller input directly — `resolveName` gates every I/O call, so traversal is impossible.
