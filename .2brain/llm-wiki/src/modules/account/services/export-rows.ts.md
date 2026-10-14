---
source: src/modules/account/services/export-rows.ts
sha256: c726f54640c7927a661555318308465d11299c120f9db0c8aba3917b206e9a20
generated_at: 2026-10-14T08:47:58.478739+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/export-rows.ts

## Purpose

Provides the shared "delete an export row and its file" operation plus the nightly reaper for expired exports. It is deliberately split out of `./export.ts` so the module barrel (`services/index.ts`) can publish the reaper to ops tooling without also exposing the export *build* path, which touches every sibling's data.

## Key elements

- **`removeRow(row: AccountExportRow): Promise<void>`** — Deletes the backing file first (via `removeExport`), then the database row (via `accountExportRepository.deleteById`). Order matters: a leftover row without a file is harmless (the reaper clears it); a leftover file without a row is invisible except to the age sweep.
- **`reapExpiredExports(): Promise<{ rows: number; files: number }>`** — The nightly `reap:account-exports` job entry point. Recursively drains all expired rows in batches of `REAP_BATCH` (200), deleting each via `removeRow`, then calls `reapExports(exportRetentionMs())` to sweep orphaned files no row references. Returns counts of rows and stray files deleted.
- **`REAP_BATCH`** (module-internal, `200`) — Page size for the `findExpired` query in the drain loop.

## Relationships

- **`src/infrastructure/adapters/export-store.ts`** — Supplies `removeExport` (single-file delete) and `reapExports` (bulk age-sweep). This file delegates all file-system I/O to that adapter.
- **`src/modules/account/repository.ts`** — Supplies `accountExportRepository` (row CRUD) and the `AccountExportRow` type.
- **`src/modules/account/config.ts`** — Supplies `exportRetentionMs`, the retention threshold passed to `reapExports`.
- **`src/modules/account/services/index.ts`** — Barrel that re-exports `removeRow` / `reapExpiredExports` while *excluding* `./export.ts`'s build path, keeping the ops surface minimal.
- **`scripts/ops/reap-account-exports.ts`** — The ops script that invokes `reapExpiredExports` on a schedule.
- **`src/modules/account/services/export.ts`** — Sibling module for *creating* exports; this file handles only the *deletion* side. They are kept in separate files for the barrel-publishing reason above.
- **`src/modules/account/tests/integration/export.test.ts`** — Integration tests covering the export lifecycle, including the delete path exercised here.
- **`src/modules/audit-logs/tests/integration/incidents.test.ts`** — Exercises the shared erasure path (user-initiated delete) that calls `removeRow`.

## Notes

- **File-before-row ordering in `removeRow` is intentional.** If the process crashes between the two steps, the orphaned file is recovered by the next `reapExports` age sweep; an orphaned row is simply invisible to the account.
- **`drain` is a recursive loop, not a `while`.** Each iteration issues exactly one `findExpired` query (≤ 200 rows) and one fan-out of `Promise.all` deletes before recursing, keeping memory bounded.
- **`exportRetentionMs` is called at reaper time, not import time.** This means a config change (e.g., a feature flag or env var) takes effect on the next run without a redeploy.
