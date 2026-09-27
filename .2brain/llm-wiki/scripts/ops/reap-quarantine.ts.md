---
source: scripts/ops/reap-quarantine.ts
sha256: 4001601f3d20a7751bee210239a5b0aafc2616fe5247ca5c5eaa9ae80e1cab47
generated_at: 2026-09-27T13:58:02.307242+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/reap-quarantine.ts

## Purpose

Periodic backstop job (`npm run reap:quarantine`) that deletes quarantined upload files older than a configurable retention window. It exists to catch files left behind by edge cases (post-quarantine crash, unregistered collection, lost delivery) that the normal pipeline's own `removeQuarantined` calls would not reach. Intended to run as a cron or scheduled-container task, not by hand.

## Key elements

- **`retentionMs()`** — Reads `NODE_QUARANTINE_RETENTION_HOURS` (default 24) via `environmentNumber` and returns the cutoff as milliseconds.
- **`main()`** — Resolves the quarantine root, calls `reapDirectory` with the cutoff timestamp, logs `{ checked, reaped }`, then calls `start()` to open the Mongo connection (needed only by the lease record).
- **`runScript('reap:quarantine', main, stopDatabase)`** — Wraps execution so the job's outcome is recorded in the `leases` Mongo collection; `stopDatabase` is the teardown hook.

## Relationships

- **`scripts/run-script.ts`** — Provides the `runScript` wrapper that handles lifecycle and writes the lease/outcome record to Mongo.
- **`src/infrastructure/adapters/filesystem.ts`** — `reapDirectory` performs the actual directory sweep and file deletion.
- **`src/infrastructure/adapters/image-store.ts`** — `quarantineRoot` resolves the base path (`NODE_QUARANTINE_PATH`) that holds quarantine files.
- **`src/infrastructure/adapters/logger.ts`** — Structured log of the sweep result (root, checked count, reaped count).
- **`src/infrastructure/runtime/database.ts`** — `start()` opens Mongo (only for the lease record); `stopDatabase` closes it after the job completes.
- **`src/infrastructure/runtime/environment.ts`** — `environmentNumber` reads the retention-hours config with a minimum of 1.

## Notes

- **Sweep-before-connect (PL-28):** The file-system sweep runs *before* `start()` is called, so a Mongo outage cannot block a cleanup that does not need Mongo. The DB connection exists solely for `runScript`'s lease record.
- **Safe to run concurrently:** The quarantine directory is never served and only read by the digest pipeline, so reaping past the retention window cannot affect in-flight requests.
- **24 h default is deliberate:** Long enough that a broker outage spanning a normal maintenance window does not cause data loss.
- **Not a primary cleanup path:** Every normal success/failure in `image.worker.ts` calls `removeQuarantined` itself; this script is the last-resort sweep for whatever slips through.
