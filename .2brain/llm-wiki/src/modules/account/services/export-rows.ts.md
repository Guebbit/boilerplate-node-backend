---
source: src/modules/account/services/export-rows.ts
sha256: c726f54640c7927a661555318308465d11299c120f9db0c8aba3917b206e9a20
generated_at: 2026-11-08T04:17:47.503728+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/export-rows.ts

## Purpose

Handles the **deletion** side of account data exports: the shared single-row delete used by both the user request path and the nightly reaper, plus the reaper loop itself. It lives in a separate file from `./export.ts` so the module barrel can publish the reaper without also publishing the build path (which reaches every sibling's data).

## Key elements

- **`removeRow(row: AccountExportRow)`** — Deletes one export: removes the file via `removeExport`, then deletes the DB row by `_id`. File-first ordering is intentional (see Notes).
- **`REAP_BATCH`** (const, 200) — Max rows fetched per query in the reaper's drain loop.
- **`reapExpiredExports()`** — The nightly `reap:account-exports` job. Recursively drains all expired rows in batches of `REAP_BATCH`, then calls `reapExports(exportRetentionMs())` to sweep files no remaining row points at. Returns `{ rows, files }` counts.

## Relationships

- **`src/infrastructure/adapters/export-store.ts`** — Source of `removeExport` (single-file delete) and `reapExports` (age-based orphan-file sweep).
- **`src/modules/account/config.ts`** — Provides `exportRetentionMs`, the retention window passed to the age sweep.
- **`src/modules/account/repository.ts`** — Provides `accountExportRepository` (`findExpired`, `deleteById`) and the `AccountExportRow` type.
- **`src/modules/account/services/export.ts`** — Sibling build module; deliberately kept separate so the barrel doesn't co-expose build and reaper.
- **`src/modules/account/services/index.ts`** — Barrel that re-exports this module's public surface.
- **`src/modules/account/jobs.ts`** — Schedules `reapExpiredExports` as the nightly cron job.
- **`src/modules/account/tests/integration/export.test.ts`** — Integration tests exercising the delete/reap paths.

## Notes

- **Delete order is load-bearing:** file is removed *before* the row. A lingering row without a file is harmless (the reaper cleans it); a lingering file without a row is invisible to the account and only the age sweep can find it.
- **Drain is recursive (tail-recursive pattern):** if a batch returns `REAP_BATCH` rows, it re-queries; termination is guaranteed once a short batch is returned.
- The file's module doc comment explicitly names the separation rationale—don't merge it back into `export.ts` without re-evaluating barrel exposure.
