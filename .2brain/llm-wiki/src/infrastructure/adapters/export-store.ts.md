---
source: src/infrastructure/adapters/export-store.ts
source_sha256: d54b9586e649dfcdeb962eff4dfd5886a5582d133aa378c5cfd04c08cc6c8365
context_sha256: 662508ad94b5c9e470336b6b36e7cfe2b44bc248183a9f7eed8de2b5551ceebf
generated_at: 2026-11-22T02:36:21.501876+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/export-store.ts

## Purpose
On-disk store for built personal-data exports, kept until downloaded or expired. Files are written and read as streams (never held whole in memory), live outside `NODE_PUBLIC_PATH`, and are plaintext on purpose (at-rest protection is the host's responsibility). The file is a regenerable copy, not a record: the Mongo export row says ownership and readiness, and the file is never backed up.

## Key elements
- `AppendExport` — type `(text: string) => Promise<void>`; appends the next piece to the file being built.
- `writeExport(name, produce)` — builds a file atomically. Creates the root dir (`mkdir -p`), then `produce` appends to a temporary file in the same directory. The file is renamed over the final name only if `produce` resolves. A failed build leaves nothing behind. Rejects for an invalid name.
- `openExport(name)` — returns a `Readable` stream, or `undefined` if the file is absent (`ENOENT`) or the name is invalid. Other errors are rethrown.
- `removeExport(name)` — deletes one export; returns whether a file was actually deleted (`false` for invalid names or already absent).
- `reapExports(retentionMs)` — deletes files last modified at or before `now - retentionMs`; returns a `ReapResult` (files checked and deleted). Backs the `reap:account-exports` sweep for orphaned files such as failed deletes or abandoned temporaries.
- Internal: `exportRoot()` (resolves `NODE_ACCOUNT_EXPORT_STORE_PATH`), `NAME_PATTERN`, `resolveName`, `produceInto` (opens the temp file, runs `produce`, always closes the handle).

## Relationships
- `config.ts` — supplies `exportStoreConfig()`, whose `NODE_ACCOUNT_EXPORT_STORE_PATH` sets the root directory.
- `filesystem.ts` — provides `writeFileAtomically`, `unlinkIfPresent`, `reapDirectory` and the `ReapResult` type; this file adds the export-specific naming and path rules on top.
- `src/infrastructure/config/fields.ts` — a graph neighbor; the config field definitions are not referenced directly in this file.
- `export-job.ts`, `export-rows.ts`, `export.ts` (account services) — neighbors in the account export flow, which this store serves. How each calls it is not visible here.
- `tests/unit/infrastructure/adapters/export-store.test.ts` — unit tests for this module.

## Notes
- Only names matching `/^[\w-]{1,80}\.json$/` are accepted (for example `<recordId>.json`). Anything else is rejected or treated as absent, and is never joined onto a path. This is the path-traversal guard.
- The root is resolved on every call, so config is read at call time rather than at import.
- Backpressure comes from `FileHandle#write` resolving once the bytes are handed to the OS, so no drain handler is needed.
- Retention is judged by modification time, so a file is kept from the moment it was built.
- Unlike `document-store.ts`, this store is stream-only.
- Default root is dev-only; mount a volume at the configured path in a deployment.
