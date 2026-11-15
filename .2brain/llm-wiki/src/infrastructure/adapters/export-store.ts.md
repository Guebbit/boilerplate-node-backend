---
source: src/infrastructure/adapters/export-store.ts
sha256: 5f7be5b22e40bf97915e508ef6d716a238a832ca3822c3ccfb294686061211fd
generated_at: 2026-11-14T17:53:08.519387+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/export-store.ts

## Purpose

Manages personal-data export files on disk: building them in streamed chunks, reading them back as `Readable` streams, deleting individual files, and reaping expired ones. It exists so large exports can be written and served without ever holding the entire file in memory.

## Key elements

- **`writeExport(name, produce)`** — Atomically builds an export file. `produce` receives an `append` callback; the file is written to a temp in the same directory and renamed only on success. Rejects names that don't match the store's shape.
- **`openExport(name)`** — Opens a stored export as a `Readable` stream. Resolves `undefined` if the file is absent (`ENOENT`); throws on other errors.
- **`removeExport(name)`** — Deletes one export file. Resolves `false` if the file was already gone.
- **`reapExports(retentionMs)`** — Deletes every file in the root last modified before the cutoff. Used by the `reap:account-exports` sweep to clean up orphaned files.
- **`AppendExport`** (type) — `(text: string) => Promise<void>`; the callback shape handed to a producer.
- **`NAME_PATTERN`** — `^[\w-]{1,80}\.json$`; the only file-name shape this store reads or writes. Any other input is rejected before a path is constructed.
- **`resolveName(name)`** — Internal; validates the name and joins it to the export root, or returns `undefined`.
- **`produceInto(temporary, produce)`** — Internal; opens the temp file handle, passes the `append` closure to `produce`, and guarantees the handle is closed.
- **`exportRoot()`** — Internal; resolves `exportStoreConfig().NODE_ACCOUNT_EXPORT_STORE_PATH` to an absolute path.

## Relationships

- **`src/infrastructure/adapters/filesystem.ts`** — Provides the low-level primitives used here: `writeFileAtomically` (temp+rename), `unlinkIfPresent` (safe delete returning a boolean), `reapDirectory` (age-based sweep), and the `ReapResult` type.
- **`src/infrastructure/adapters/config.ts`** — Source of `exportStoreConfig()`, which supplies the `NODE_ACCOUNT_EXPORT_STORE_PATH` value that determines where files are stored.
- **`src/modules/account/services/export.ts`**, **`export-job.ts`**, **`export-rows.ts`** — Downstream consumers in the account module that call this store's exported functions to build, fetch, and clean up export files.
- **`src/infrastructure/config/fields.ts`** — Defines the config field backing `NODE_ACCOUNT_EXPORT_STORE_PATH`.
- **`tests/unit/infrastructure/adapters/export-store.test.ts`** — Unit tests for the four public exports.

## Notes

- **Streaming both directions:** writes are paced by the disk (each `append` resolves only when bytes are handed to the OS); reads are a `Readable` stream. The whole file is never buffered in memory.
- **Path-traversal guard:** `resolveName` validates against `NAME_PATTERN` *before* joining to the root. A caller cannot name a file outside the export directory.
- **Plaintext on disk by design:** at-rest encryption is the host's responsibility (documented in `docs/theory/defences/crypto-and-secrets.md`). The store must live **outside** `NODE_PUBLIC_PATH`.
- **Absence is the happy path:** `openExport` and `removeExport` treat "file not found" as a normal, non-error outcome (never built, or already reaped).
- **Reaping is by mtime:** a file is considered fresh from the moment it finishes building, so a long-running build won't be swept mid-write.
