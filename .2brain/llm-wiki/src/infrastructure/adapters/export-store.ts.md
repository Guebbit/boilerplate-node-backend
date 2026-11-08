---
source: src/infrastructure/adapters/export-store.ts
sha256: 10463fc984dade781ca3034b76f48db29cb2be76fe2f46ab428a763da7aec132
generated_at: 2026-11-08T03:18:47.564194+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/export-store.ts

## Purpose

Manages the lifecycle of built personal-data export files on disk: writing them incrementally, streaming them back to a client, deleting them individually, and sweeping expired ones. It exists because exports can be large (so everything is streamed, never held in memory) and are regenerable copies tied to a Mongo record rather than canonical data themselves.

## Key elements

- **`exportRoot()`** – Resolves the export directory from `exportStoreConfig().NODE_ACCOUNT_EXPORT_STORE_PATH`. A deployment is expected to mount a volume here.
- **`NAME_PATTERN`** / **`resolveName(name)`** – Validates that a name matches `^[\w-]{1,80}\.json$` before joining it onto the root. Any other shape returns `undefined` (or throws, depending on the call site), preventing path traversal.
- **`writeExport(name, produce)`** – Atomically builds a file: `produce` receives an `append` callback that writes to a temp file in the same directory; only on success is the temp file renamed over the final name. A reader never sees a partial file.
- **`openExport(name)`** – Opens the stored file for reading and returns a `Readable` stream. Resolves `undefined` if the file is absent (`ENOENT`) or the name is invalid.
- **`removeExport(name)`** – Deletes a single file via `unlinkIfPresent`. Returns `true`/`false` to indicate whether a file was actually removed.
- **`reapExports(retentionMs)`** – Deletions by modification time; sweeps any file in the root older than the retention window. Returns a `ReapResult` (count checked / deleted).
- **`AppendExport`** (type) – The callback signature `(text: string) => Promise<void>` handed to `produce` inside `writeExport`.

## Relationships

- **`./filesystem.ts`** – Provides the low-level primitives this store composes: `writeFileAtomically` (temp-file + rename), `unlinkIfPresent` (safe single-delete), and `reapDirectory` (batch age-based sweep). `ReapResult` type is re-used in `reapExports`'s return.
- **`./config.ts`** – Source of `exportStoreConfig`, which supplies the on-disk root path.
- **`tests/unit/infrastructure/adapters/export-store.test.ts`** – Unit tests covering the name-validation, write/read/remove, and reap paths exported by this module.

## Notes

- **Security is by location and name-shape, not encryption.** Files are plaintext on disk; at-rest protection is delegated to the host (consistent with how Mongo data files are treated). The root sits *outside* `NODE_PUBLIC_PATH`.
- **`writeExport` is intentionally synchronous in effect but async in implementation.** The `FileHandle#write(string)` call resolves once bytes are handed to the OS, so a slow disk naturally back-pressures the producer without an explicit drain handler.
- **Atomicity guarantee:** a failed `produce` leaves no file behind (temp file is discarded); a successful one renames over the target. There is no partial-visibility window.
- **`openExport` treats `ENOENT` as normal** (file was never built or already reaped) and returns `undefined`; any other `errno` is rethrown.
- **`reapExports` uses modification time, not creation time**, so the retention clock starts the moment the file was last written (i.e., when the build completed).
