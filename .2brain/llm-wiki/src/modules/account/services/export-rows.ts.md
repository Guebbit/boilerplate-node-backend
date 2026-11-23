---
source: src/modules/account/services/export-rows.ts
source_sha256: 7512b170a11dc7abd38eed72e744985a7ecd4de10de6d4261562d08b47fb1d2d
context_sha256: 6b318c9cc9c2110445ddc72eff832988df47d8eb450115c449564ad63954204d
generated_at: 2026-11-22T03:37:05.193347+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/export-rows.ts

## Purpose
Holds the shared "delete an export row and its file" operation plus the nightly reaper for expired account exports. It is kept separate from `./export.ts` so the module barrel can publish the reaper without also publishing the export build, which reaches every sibling module's data.

## Key elements
- `removeRow(row)` — deletes the row's file via `removeExport(row.file)`, then deletes the row via `accountExportRepository.deleteById(String(row._id))`. File goes first: a row without a file is harmless (the reaper clears it), while a file without a row is invisible to the account and only the age sweep can find it. Shared by the request path, the erasure path and the reaper.
- `reapExpiredExports()` — the nightly `reap:account-exports` job. It repeatedly fetches expired rows with `findExpired(new Date(), REAP_BATCH)` and removes each with `removeRow`, until a batch comes back smaller than `REAP_BATCH`. It then calls `reapExports(exportRetentionMs())` to sweep stray files that no row points at. Returns `{ rows, files }`: rows deleted and stray files deleted.
- `REAP_BATCH` (200, not exported) — the number of due rows fetched per query.

## Relationships
- `src/infrastructure/adapters/export-store.ts` — provides `removeExport` (delete one file) and `reapExports` (age-based file sweep).
- `src/modules/account/config.ts` — provides `exportRetentionMs()`, the age threshold passed to the file sweep.
- `src/modules/account/repository.ts` — provides `accountExportRepository` (`findExpired`, `deleteById`) and the `AccountExportRow` type.
- `src/modules/account/jobs.ts`, `src/modules/account/services/index.ts` and `src/modules/account/services/export.ts` — neighbors in the dependency graph. By its own docs, this file is the shared delete used by the request, erasure and reaper paths. `export.ts` is the sibling it was split from, and the barrel publishes the reaper.
- `src/modules/account/tests/integration/export.test.ts` — integration test neighbor.

## Notes
- The drain loop is recursive, and the rows in each batch are deleted concurrently with `Promise.all`.
- The file sweep runs only after the row drain finishes.
