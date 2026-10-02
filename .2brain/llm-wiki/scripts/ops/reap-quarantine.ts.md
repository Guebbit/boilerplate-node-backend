---
source: scripts/ops/reap-quarantine.ts
sha256: 451916a00307efb2e2b8dfa4680814500145c514e0d3ed82a25a7ef50b2c7309
generated_at: 2026-10-01T12:36:35.512908+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-quarantine.ts

## Purpose

Backstop cleanup job that deletes quarantined upload files older than the configured retention window (default 24 h). It exists because a crash between `imageStore.quarantine()` and job execution, an unregistered collection name, or a lost delivery can leave quarantine files behind. Intended to run as a periodic scheduled job (cron / container task), not by hand.

## Key elements

- **`retentionMs()`** — reads `NODE_QUARANTINE_RETENTION_HOURS` from `imageConfig()` and converts to milliseconds.
- **`main()`** — resolves the quarantine root, calls `reapDirectory(root, cutoff, 'Quarantine')`, logs the `{checked, reaped}` summary, *then* opens the Mongo connection (see Notes).
- **`void runScript('reap:quarantine', main, stopDatabase)`** — entry-point wrapper; `runScript` records the job's outcome in the shared `leases` collection and calls `stopDatabase` on exit.

## Relationships

- **`scripts/run-script.ts`** — provides the `runScript` harness (DB lifecycle, outcome recording in `leases`, error handling). This script is the only reason the file touches Mongo at all.
- **`src/infrastructure/adapters/filesystem.ts`** — `reapDirectory` performs the actual file enumeration and deletion under the given root and age cutoff.
- **`src/infrastructure/adapters/image-store.ts`** — exports `quarantineRoot()`, the on-disk path that `reapDirectory` operates on.
- **`src/infrastructure/adapters/config.ts`** — `imageConfig()` supplies `NODE_QUARANTINE_RETENTION_HOURS`.
- **`src/infrastructure/adapters/logger.ts`** — structured logging of the sweep result.
- **`src/infrastructure/runtime/database.ts`** — `start()` / `stopDatabase()` manage the brief Mongo connection needed only by `runScript`'s outcome write.

## Notes

- **Sweep-before-connect (PL-28):** `main()` finishes the entire filesystem sweep *before* calling `start()`. A Mongo outage cannot block a cleanup that does not need it.
- **Idempotent and concurrency-safe:** `NODE_QUARANTINE_PATH` is never served to clients and is read only by the digest pipeline; no concurrent request can be depending on a file past the retention window.
- **Mongo connection is incidental:** the script connects to Mongo solely so `runScript` can write its outcome to the `leases` collection (D9, see `docs/reference/ops.md#scheduled-jobs`). There is no other database access.
- **Retention tuning:** adjust via the `NODE_QUARANTINE_RETENTION_HOURS` env var (loaded through `dotenv/config`). The 24 h default is deliberately long enough to survive a normal maintenance-window broker outage.
