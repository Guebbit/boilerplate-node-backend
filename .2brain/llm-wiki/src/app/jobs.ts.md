---
source: src/app/jobs.ts
sha256: 2d5c7de945e9dc08272211ca03258ee3d2d355bc806452f149502bea3eed0cd0
generated_at: 2026-11-14T17:49:06.044151+00:00
model: ollama:qwen3.8:27b
---

# src/app/jobs.ts

## Purpose

Declares the scheduled jobs that belong to no specific module — the "app-level" housekeeping jobs (quarantine reaper, orphaned-image sweep, mail-spool reaper, outbox backstop). Jobs owned by a module live on its `AppModule.jobs` manifest instead; everything here is declared once, centrally, in `appJobs`.

## Key elements

- **`appJobs: readonly JobDeclaration[]`** — the single export. An array of four job declarations, each spread from a pre-generated metadata object (`appJobData.*` from `./jobs.generated`) and augmented with a `run` closure.

  - `reapQuarantine` — deletes files older than the configured retention window (default 24 h) from the quarantine root via `reapDirectory`. `connectFirst: false` (no DB needed).
  - `reapOrphanedImages` — calls `reapOrphanedImages` with the set of image-target keys resolved from all enabled modules.
  - `reapMailSpool` — reaps spooled mail attachments older than the configured retention (default 1 h). Logs only when at least one file is reaped. `connectFirst: false`.
  - `sweepOutbox` — calls `relayOutbox()` and logs the result.

## Relationships

- **`src/kernel/registry.ts`** — imports the `JobDeclaration` type (shape of each entry) and `resolveImageTargets` (maps module names → image target keys).
- **`src/kernel/outbox.ts`** — provides `relayOutbox`, the actual sweep logic for the outbox job.
- **`src/modules.ts`** — provides `enabledModules`, the list of active module names used to scope the orphaned-image sweep.
- **`src/infrastructure/adapters/config.ts`** — `imageConfig` and `mailFilesConfig` supply the retention-hour constants.
- **`src/infrastructure/adapters/filesystem.ts`** — `reapDirectory` performs the directory-level file deletion.
- **`src/infrastructure/adapters/image-store.ts`** — `quarantineRoot` returns the filesystem path to the quarantine directory.
- **`src/infrastructure/adapters/mail-spool.ts`** — `reapSpooled` deletes expired spooled attachments.
- **`src/infrastructure/adapters/orphaned-images.ts`** — `reapOrphanedImages` performs the orphaned-image cleanup.
- **`src/infrastructure/adapters/logger.ts`** — structured logging for each job's outcome.
- **`src/domain-primitives/time.ts`** — `HOUR_MS` constant for converting config hours to milliseconds.
- **`scripts/docs/generate-jobs.ts`** — generates the `appJobData` metadata object (schedule cadence, names) that this file spreads into each declaration.
- **`scripts/ops/run-job.ts`** — operational entry point that can trigger individual jobs by name.
- **`tests/cross-cutting/scheduled-jobs.test.ts`** — cross-cutting tests exercising the job declarations.
- **`tests/integration/ops-outbox-sweep-job.test.ts`** — integration test for the outbox sweep job.
- **`tests/support/drain.ts`** — test helper that drains queued work (likely used alongside the above tests).

## Notes

- The schedule metadata (cron expressions, names, etc.) is **not** hand-written here; it comes from the generated `./jobs.generated` file. Edit the generator source (`scripts/docs/generate-jobs.ts`) or its inputs, not this file, to change cadence.
- `connectFirst: false` on the quarantine and mail-spool jobs means the scheduler may run them without a database connection; the outbox sweep and orphaned-image sweep do **not** set this flag and therefore require a live connection.
- Retention thresholds are read from config at invocation time, not at import time, so config changes take effect on the next run without a restart.
