---
source: src/app/jobs.ts
sha256: aaeb9bf1530b75cb73a4d7c832aa0a1045d8a1e4f5388d33d57df5f172add052
generated_at: 2026-11-08T03:13:22.536806+00:00
model: ollama:qwen3.8:27b
---

# src/app/jobs.ts

## Purpose

Declares the four application-level scheduled jobs that are not owned by any domain module: quarantine reaping, orphaned-image sweep, mail-spool reaping, and outbox backstop. Module-specific jobs live on their respective `AppModule.jobs` manifest; this file is the catch-all for cross-cutting cleanup and delivery guarantees.

## Key elements

- **`appJobs`** (exported, `readonly JobDeclaration[]`) — the four job declarations, each spreading scheduling metadata from `appJobData` (imported from the generated `./jobs.generated` file) and supplying a `run` closure.
- **`quarantineRetentionMs()`** — computes the quarantine abandonment threshold from `imageConfig().NODE_QUARANTINE_RETENTION_HOURS × HOUR_MS` (default 24 h).
- **`mailSpoolRetentionMs()`** — computes the mail-spool abandonment threshold from `mailFilesConfig().NODE_MAIL_SPOOL_RETENTION_HOURS × HOUR_MS` (default 1 h).
- **Job: `reapQuarantine`** — calls `reapDirectory` on `quarantineRoot()`; sets `connectFirst: false` (no DB needed).
- **Job: `reapOrphanedImages`** — delegates to `reapOrphanedImages` with image-target keys resolved across `enabledModules`.
- **Job: `reapMailSpool`** — calls `reapSpooled`; logs only when something was actually reaped; `connectFirst: false`.
- **Job: `sweepOutbox`** — calls `relayOutbox`; declares `needs: { subscriptions: true }` because the outbox refuses to relay in a process with no registered subscribers.

## Relationships

- **`src/kernel/registry.ts`** — provides the `JobDeclaration` type and `resolveImageTargets()` used to enumerate image targets for the orphan sweep.
- **`src/kernel/outbox.ts`** — provides `relayOutbox()` for the outbox backstop job.
- **`src/modules.ts`** — provides `enabledModules`, the set of modules whose image targets the orphan sweep considers.
- **`src/infrastructure/adapters/*`** — `filesystem.reapDirectory`, `image-store.quarantineRoot`, `mail-spool.reapSpooled`, `orphaned-images.reapOrphanedImages`, `logger`, and `config` are the concrete I/O the job closures invoke.
- **`src/domain-primitives/time.ts`** — supplies the `HOUR_MS` constant used in both retention helpers.
- **`scripts/docs/generate-jobs.ts`** — generates the `jobs.generated.ts` file from which `appJobData` is imported (scheduling names, intervals, etc.).
- **`scripts/ops/run-job.ts`** — operational entry point that executes individual jobs from this registry.
- **`tests/cross-cutting/scheduled-jobs.test.ts`** — integration tests covering all four jobs.
- **`tests/support/drain.ts`** — test helper that flushes the outbox between tests.

## Notes

- Two jobs set `connectFirst: false`, meaning the runtime scheduler may run them without establishing a database connection first. The other two implicitly require it.
- `sweepOutbox` is the only job that declares a `needs` dependency (`subscriptions: true`); callers/schedulers must ensure event subscribers are registered before invoking it, or it will throw.
- Retention thresholds are read at call time (function calls, not module-level constants), so config changes take effect without a restart.
- The generated `appJobData` object carries the scheduling metadata (job name, interval, description) that `generate-jobs.ts` produces; the `run` closures here are the only hand-written logic per job.
