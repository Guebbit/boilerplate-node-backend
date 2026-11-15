---
source: scripts/ops/run-job.ts
sha256: 3463a5e0d269808d1321c07ab2466166c4769e08111904465cddc90c68cac806
generated_at: 2026-11-14T17:38:39.503500+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/run-job.ts

## Purpose

Single entry point for every scheduled job (`npm run job <name>`). It resolves the named job from the declaration registry, connects to infrastructure, boots like the app, executes the work, and records the outcome — all without ever being invoked at boot. Designed to be triggered exclusively from cron.

## Key elements

- **`allJobs()`** — Returns the combined set of job declarations: unowned app jobs (`appJobs`) followed by each enabled module's jobs (`resolveJobs(enabledModules)`).
- **`execute(job)`** — Orders the connection/boots based on `job.connectFirst`. If `false`, the work runs *before* `startJob()` (for sweep jobs that don't need Mongo); otherwise it connects → `prepareJob()` → `runJobWork(job)`.
- **`requestedJob()`** — Parses a single positional CLI argument via `parseArgs`, looks it up in `allJobs()`, or prints the known names and `process.exit(1)`.
- **Entry-point block (bottom)** — Calls `boundQueueRetries()` to cap broker reconnects, then delegates to `runScript(job.name, () => execute(job), cleanup)` where cleanup stops database and queue connections.

## Relationships

- **`scripts/ops/prepare-job.ts`** — Provides `prepareJob` (app-style boot) and `runJobWork` (the actual job body). This file orchestrates *when* they are called.
- **`scripts/run-script.ts`** — `runScript` wraps the execution, records success/failure (via lease document or by name), and manages the process exit code. This file supplies the work and cleanup callbacks.
- **`src/app/jobs.ts`** — Source of `appJobs`, the jobs that don't belong to any specific module.
- **`src/kernel/registry.ts`** — Source of `resolveJobs(enabledModules)` and the `JobDeclaration` type.
- **`src/modules.ts`** — Source of `enabledModules`, which determines which module job lists are included.
- **`src/infrastructure/runtime/database.ts`** — `startJob()` (connect) and `stopDatabase()` (cleanup).
- **`src/infrastructure/adapters/queue.ts`** — `boundQueueRetries()` (prevents infinite reconnect) and `stopQueue()` (cleanup).
- **`src/infrastructure/config/dotenv.ts`** — Side-effect import; loads env vars before anything else.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Side-effect import; must load before any Mongoose schema is built.

## Notes

- **Import order is load-bearing.** `dotenv` and `mongoose-boot` are side-effect imports that must execute before any model or adapter module is evaluated; reordering them silently breaks Mongoose defaults.
- **`connectFirst: false`** is an opt-out for sweep/cleanup jobs that must run even when Mongo is unreachable. The work executes, *then* `startJob()` is attempted.
- **Lease-aware outcome recording.** When `job.lease` is set, `runScript` records through the lease document so a skipped run (held by another instance) is not misread as a success.
- **No forced-exit deadline.** The process is expected to give up on a dead broker (via `boundQueueRetries`) rather than retry indefinitely; there is no external timeout wrapper.
- **Floating promise is intentional.** `runScript` never rejects — it reports failure via the process exit code — hence the `// eslint-disable-next-line` for `no-floating-promises`.
