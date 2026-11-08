---
source: scripts/ops/run-job.ts
sha256: 9dcafebee8b1593a63e691c4a0f0a941ccbb8e5af11ed4900f643321ba8df5d5
generated_at: 2026-11-08T02:55:54.173276+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/run-job.ts

## Purpose

The single CLI entry point for every scheduled job (`npm run job <name>`). It resolves a job declaration from the module or app manifest, optionally connects to the database, prepares and runs the job (under a distributed lease when applicable), and delegates outcome recording and cleanup to `runScript`. Designed to be invoked from cron only; every job it runs is expected to be idempotent.

## Key elements

- **`allJobs()`** — Concatenates `appJobs` (module-less) with jobs resolved from `enabledModules` via `resolveJobs`, returning the full set of runnable job declarations.
- **`work(job)`** — Executes `job.run()`. If the job declares a lease, wraps execution in `withLease`; logs an info message if the run was skipped (lease held by another process).
- **`execute(job)`** — Orchestrates the connect → prepare → work sequence. When `job.connectFirst === false`, skips the DB connection before work and calls `startJob()` after; otherwise connects first.
- **`requestedJob()`** — Parses positional CLI args with `parseArgs`, finds the job by name in `allJobs()`, and exits non-zero with a list of known names if not found.
- **Entry point (bottom of file)** — Calls `runScript(job.lease ? undefined : job.name, () => execute(job), cleanup)` so the outcome is recorded under the job name (or via the lease document for leased jobs) and `stopDatabase` / `stopQueue` are always invoked.

## Relationships

- **`src/infrastructure/config/dotenv.ts`** — Side-effect import (first), loads environment variables before any other module.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Side-effect import (second), sets Mongoose connection defaults before schemas are built.
- **`src/infrastructure/adapters/logger.ts`** — `logger.info` used to report a skipped lease run.
- **`src/infrastructure/adapters/queue.ts`** — `stopQueue` called in the cleanup callback passed to `runScript`.
- **`src/infrastructure/runtime/database.ts`** — `startJob` opens the DB connection (positioned before or after work per `connectFirst`); `stopDatabase` in cleanup.
- **`src/infrastructure/persistence/lease.ts`** — `withLease` guards `job.run()` when a lease is declared.
- **`src/kernel/registry.ts`** — `resolveJobs(enabledModules)` supplies module-owned job declarations; `JobDeclaration` is the shared type.
- **`src/modules.ts`** — `enabledModules` is the input to `resolveJobs`.
- **`src/app/jobs.ts`** — `appJobs` provides jobs that belong to no module.
- **`scripts/ops/prepare-job.ts`** — `prepareJob(job)` runs immediately before `work(job)` in `execute`.
- **`scripts/run-script.ts`** — `runScript` wraps the entire execution: records success/failure, manages `process.exitCode`, and invokes the cleanup function.

## Notes

- **Import order is load-bearing.** `dotenv` must load before any config is read; `mongoose-boot` must run before any Mongoose model is imported (defaults are captured at schema-build time).
- **Leased vs. non-leased recording.** For leased jobs the name passed to `runScript` is `undefined`, so the outcome is written through the lease document itself. This ensures a *skipped* run (lease still held) is not indistinguishable from a successful one.
- **`withLease` return-value convention.** `undefined` means "skipped, another holder has the lease"; `true` means "this process ran it." A job's own `run()` result is often `undefined`, so the sentinel `true` is used explicitly.
- **`connectFirst === false`** indicates the job (e.g. a sweep) does not need Mongo before its work; the connection is deferred until after `work` completes.
- The floating-promise eslint suppression is safe because `runScript` never rejects — it signals failure via `process.exitCode`.
