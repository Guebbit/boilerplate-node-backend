---
source: src/app/jobs.ts
sha256: 6eb7aaea1efe9b4f8619001a979cb1fa571f44e7c24f875be708722fe873e350
generated_at: 2026-10-29T01:50:32.455617+00:00
model: ollama:qwen3.8:27b
---

# src/app/jobs.ts

## Purpose

Declares the application-level scheduled jobs that don't belong to any domain module: quarantine reaping, orphaned-image sweeping, mail-spool reaping, and outbox sweeping. Module-owned jobs live on each `AppModule.jobs` manifest; this file is the catch-all for cross-cutting cleanup.

## Key elements

- **`appJobs: readonly JobDeclaration[]`** — The single export. An array of four job declarations, each spread from `appJobData` (schedule, name, metadata) with a local `run` implementation:
  - `reapQuarantine` — calls `reapDirectory` on the quarantine root after the configured retention window.
  - `reapOrphanedImages` — calls `reapOrphanedImages` with image targets derived from `enabledModules`.
  - `reapMailSpool` — calls `reapSpooled` with the configured spool retention; logs only when something was actually reaped.
  - `sweepOutbox` — calls `relayOutbox` to flush queued outbound events.
- **`quarantineRetentionMs()`** — Reads `imageConfig().NODE_QUARANTINE_RETENTION_HOURS` and converts to ms.
- **`mailSpoolRetentionMs()`** — Reads `mailFilesConfig().NODE_MAIL_SPOOL_RETENTION_HOURS` and converts to ms.
- **`HOUR_MS`** — Module-private constant (3 600 000) used by both retention helpers.

## Relationships

- **`src/app/jobs.generated.ts`** — Source of the `appJobData` object (schedule, name, description metadata) that each job spreads over its local declaration.
- **`src/modules.ts`** — Provides `enabledModules`, which feeds `resolveImageTargets` for the orphaned-image sweep.
- **`src/kernel/registry.ts`** — Supplies the `JobDeclaration` type and `resolveImageTargets`.
- **`src/kernel/outbox.ts`** — Supplies `relayOutbox`, the core work of the outbox sweep job.
- **`src/infrastructure/adapters/config.ts`** — Supplies `imageConfig` / `mailFilesConfig` for retention tuning.
- **`src/infrastructure/adapters/filesystem.ts`** — Supplies `reapDirectory` used by the quarantine job.
- **`src/infrastructure/adapters/image-store.ts`** — Supplies `quarantineRoot` (the directory the quarantine job sweeps).
- **`src/infrastructure/adapters/mail-spool.ts`** — Supplies `reapSpooled`.
- **`src/infrastructure/adapters/orphaned-images.ts`** — Supplies `reapOrphanedImages`.
- **`src/infrastructure/adapters/logger.ts`** — Used for structured log output in three of the four jobs.
- **`scripts/docs/generate-jobs.ts`** — Generates `jobs.generated.ts` from the `appJobs` export in this file.
- **`scripts/ops/run-job.ts`** — Consumes the registered jobs at runtime.
- **`tests/cross-cutting/scheduled-jobs.test.ts`** — Exercises the job declarations and their `run` functions.
- **`tests/support/drain.ts`** — Test helper that drains spool/outbox state between job tests.

## Notes

- Retention thresholds are **config-driven**, not hard-coded. Change them via `NODE_QUARANTINE_RETENTION_HOURS` / `NODE_MAIL_SPOOL_RETENTION_HOURS` env vars; the code never touches a literal hour count directly.
- `connectFirst: false` on `reapQuarantine` and `reapMailSpool` means these jobs run **without** a database connection — they are pure filesystem operations. Don't assume a DB handle is available inside their `run` callback.
- `needs: { subscriptions: true }` on `sweepOutbox` signals the runner that event subscribers must be registered before the job fires; `relayOutbox` will throw in a process with no subscribers.
- The schedule/name/metadata for each job is **generated**, not hand-written. If you need to change cadence or labels, edit the source that feeds `scripts/docs/generate-jobs.ts`, not this file.
- This file is explicitly **not** a place for module-specific jobs. The doc comment directs you to `AppModule.jobs` for anything a module owns.
