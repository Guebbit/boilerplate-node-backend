---
source: src/infrastructure/adapters/export-store.ts
sha256: 4acb50e070188ac2eb3f3cdf4d379076e356b5eb75ef39fda72d41c9d30d23e8
generated_at: 2026-10-14T07:43:25.062512+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/export-store.ts

## Purpose

Filesystem adapter that persists a built personal-data export on disk between the moment it is generated and the moment it is downloaded or reaped. It is deliberately streamed (neither write nor read ever holds the whole file in memory) and deliberately private (outside `NODE_PUBLIC_PATH`, plaintext on disk with at-rest protection delegated to the host). It is a regenerable copy, not a record of truth.

## Key elements

- **`AppendExport`** — exported type; the callback signature `(text: string) => Promise<void>` handed to producers during a build.
- **`writeExport(name, produce)`** — builds an export atomically: writes to a random-suffixed `.tmp` file in the same directory, then `rename`s to the final name. A failed build unlinks the temp file and throws. Callers append pieces via the `AppendExport` callback.
- **`openExport(name)`** — opens the stored file for reading and returns a `Readable` stream, or `undefined` if the file is absent or the name is invalid. The stream closes the handle on end/destroy.
- **`removeExport(name)`** — unlinks a single stored export. Returns `true` only if a file was actually deleted; absent is a non-error.
- **`reapExports(retentionMs)`** — deletes every file in the store whose mtime is older than the retention window. Used by the `reap:account-exports` sweep for orphaned temps or files whose record was deleted.
- **`NAME_PATTERN` / `resolveName`** — internal. Enforces `^[\w-]{1,80}\.json$`; any name failing the regex yields `undefined`, so no caller-supplied string can ever be joined onto a path.

## Relationships

- **`./filesystem.ts`** — provides `reapDirectory`, `unlinkIfPresent`, and the `ReapResult` type used by `reapExports` and `removeExport`.
- **`./config.ts`** — source of `exportStoreConfig()` which supplies `NODE_ACCOUNT_EXPORT_STORE_PATH` (the store root).
- **`src/modules/account/services/export.ts`** — the orchestration service that drives the build/download/delete lifecycle; calls into `writeExport`, `openExport`, and `removeExport`.
- **`src/modules/account/services/export-job.ts`** — manages the Mongo record (owner, ready flag) that references the file name this store writes.
- **`src/modules/account/services/export-rows.ts`** — produces the row data appended through the `AppendExport` callback during a `writeExport` call.
- **`tests/unit/infrastructure/adapters/export-store.test.ts`** — unit tests for the adapter's public functions.

## Notes

- **Atomicity contract:** a reader sees either no file or a complete one; a mid-build crash leaves only a `.tmp` file (cleaned up by `reapExports` or the next successful build of the same name).
- **`FileHandle#write(string)` paces the producer** — it resolves only after bytes are handed to the OS, so no explicit drain/back-pressure handler is needed for large exports.
- **Plaintext on disk is intentional** (see `docs/theory/defences/crypto-and-secrets.md`); do not add application-level encryption here.
- **Name is the only handle** — there is no ID-to-path mapping in this module; the caller is responsible for knowing the correct `<slug>.json` name (typically the record's `recordId`).
- **Default store path is dev-only**; production deployments must mount a volume at `NODE_ACCOUNT_EXPORT_STORE_PATH`.
