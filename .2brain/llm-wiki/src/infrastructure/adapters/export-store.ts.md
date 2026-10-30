---
source: src/infrastructure/adapters/export-store.ts
sha256: 10463fc984dade781ca3034b76f48db29cb2be76fe2f46ab428a763da7aec132
generated_at: 2026-10-29T01:53:40.459785+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/export-store.ts

## Purpose

Disk-backed store for a user's personal-data export file. It writes the export incrementally (streamed), reads it back as a stream, and manages deletion and retention sweeping. The file is a regenerable copy — not a record — and is intentionally plaintext, outside `NODE_PUBLIC_PATH`, with at-rest protection delegated to the host.

## Key elements

- **`exportRoot()`** — Resolves the base directory from `exportStoreConfig().NODE_ACCOUNT_EXPORT_STORE_PATH`.
- **`NAME_PATTERN`** — Regex `^[\w-]{1,80}\.json$`; the only name shape this store accepts, preventing path traversal.
- **`resolveName(name)`** — Validates a name against `NAME_PATTERN` and joins it to the root; returns `undefined` for invalid names.
- **`writeExport(name, produce)`** — Atomically builds an export by streaming `append` calls into a temp file, then renaming over the final name. A failed build leaves nothing on disk.
- **`openExport(name)`** — Opens the stored file and returns a `Readable` stream, or `undefined` if absent. Closes the handle on stream end/destroy.
- **`removeExport(name)`** — Deletes a single export file; treats absence as success (returns `false`).
- **`reapExports(retentionMs)`** — Sweeps the root directory, deleting files whose mtime is older than the retention window. Returns a `ReapResult` count.
- **`AppendExport`** (type) — `(text: string) => Promise<void>`, the callback passed to `produce` for sequential appends.

## Relationships

- **`./filesystem.ts`** — Provides the atomic-write (`writeFileAtomically`), safe-unlink (`unlinkIfPresent`), and directory-sweep (`reapDirectory`) primitives this module wraps.
- **`./config.ts`** — Supplies `exportStoreConfig()` for the root path.
- **`src/modules/account/services/export-job.ts`** — The producer side that calls `writeExport` (via `openExport` for reads) to build and serve the file.
- **`src/modules/account/services/export-rows.ts`** — Supplies the row data appended through the `AppendExport` callback during a build.
- **`src/modules/account/services/export.ts`** — Orchestrates the export lifecycle: triggers a build, streams the file to the client, and schedules deletion/retention.
- **`src/infrastructure/config/fields.ts`** — Defines the config field schema that `exportStoreConfig` reads.
- **`tests/unit/infrastructure/adapters/export-store.test.ts`** — Unit tests for every exported function in this module.

## Notes

- **Streaming, not buffering:** Both write and read paths use `FileHandle#write` / `createReadStream` so the full file is never in memory. A slow disk naturally back-pressures the producer.
- **Atomic visibility:** Readers see either no file or a complete one. There is no partial-read state because the rename happens only after `produce` resolves.
- **ENOENT is not an error:** `openExport` and `removeExport` treat a missing file as the ordinary case (never built, or already reaped). Any other `errno` is re-thrown.
- **Plaintext by design:** The file is unencrypted on disk. At-rest protection is the host's responsibility (see `docs/theory/defences/crypto-and-secrets.md`).
- **Name is the only identifier:** No caller-supplied path component is ever joined; only a validated slug + `.json` is accepted, so traversal is structurally impossible.
