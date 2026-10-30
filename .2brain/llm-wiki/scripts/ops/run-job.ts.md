---
source: scripts/ops/run-job.ts
sha256: 242e7a756c57233ea62d6fd186768a67303d6ba1cc7ae8e985a3f38d5844f360
generated_at: 2026-10-29T01:40:29.660979+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/run-job.ts

## Purpose

The single entry point for every scheduled job, invoked as `npm run job <name>`. It resolves the named job from the module/app registries, connects to required resources, installs the job's declared dependencies (event subscriptions, i18n), executes the work (under a distributed lease when the job declares one), and records the outcome for the `/observability/health` endpoint. Designed for cron invocation only; all jobs are expected to be idempotent.

## Key elements

- **`allJobs()`** — Returns the combined list of job declarations: app-level jobs (`appJobs`) followed by jobs resolved from each enabled module.
- **`prepare(job)`** — Installs what the job's `needs` field declares: registers module event subscriptions (if `needs.subscriptions`) and boots i18n with locale directories (if `needs.i18n`).
- **`work(job)`** — Executes `job.run()`. If the job has a `lease`, wraps it in `withLease(name, ttlMs, …)` so concurrent holders skip; logs an info message on skip.
- **`execute(job)`** — Orchestrates the three phases. Default order: connect → prepare → work. If `job.connectFirst === false`, the order becomes prepare → work → connect (for jobs that don't need Mongo during their run).
- **`requestedJob()`** — Parses the single positional CLI argument via `node:util` `parseArgs`, finds the matching job by name, or prints the known list and `process.exit(1)`.
- **Top-level `runScript(…)` call** — Wraps `execute(job)` so the outcome is recorded under the job's name (or the lease document for leased jobs) and cleanup (`stopDatabase` + `stopQueue`) runs on both success and failure paths.

## Relationships

- **`scripts/run-script.ts`** — Provides the `runScript` wrapper that records the job's success/failure for the health endpoint and guarantees the cleanup callback runs regardless of outcome.
- **`src/app/jobs.ts`** — Supplies `appJobs`, the set of jobs that belong to no specific module.
- **`src/kernel/registry.ts`** — Provides `registerModules` (called by `prepare` for subscriptions), `resolveJobs` (extracts job declarations from modules), and the `JobDeclaration` type.
- **`src/modules.ts`** — Supplies `enabledModules` (for job resolution and registration) and `enabledModuleDirectories('locales')` (for i18n boot).
- **`src/infrastructure/runtime/database.ts`** — `startJob()` opens the Mongo connection; `stopDatabase()` closes it during cleanup.
- **`src/infrastructure/persistence/lease.ts`** — `withLease` prevents two hosts from running the same leased job concurrently.
- **`src/infrastructure/i18n/boot.ts`** — `bootI18n` loads translations when a job declares `needs.i18n`.
- **`src/infrastructure/adapters/logger.ts`** — Structured logging (e.g., the "skipped: another holder already has the lease" message).
- **`src/infrastructure/adapters/queue.ts`** — `stopQueue` is part of the post-run cleanup.
- **`src/infrastructure/config/dotenv.ts`** — Loaded first to populate `process.env` before anything else reads config.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Must import before any Mongoose model so schema-level defaults are set at build time.

## Notes

- **Import order is load-bearing:** `dotenv` and `mongoose-boot` must precede all other imports; Mongoose reads defaults at schema-definition time, so anything that pulls in a model earlier will see unconfigured values.
- **Leased jobs pass `undefined` as the script name to `runScript`** so the outcome is recorded on the lease document rather than under a plain name — a skipped run must not be indistinguishable from a success.
- **`runScript` never rejects;** it signals failure through `process.exitCode`. The `void` + eslint-disable at the call site is intentional.
- **`connectFirst === false`** is an opt-out for jobs whose work never touches Mongo; in that case the connection is opened *after* the work completes and closed during cleanup.
- Intended to be driven by cron (`docker/crontab`), generated from the same job declarations — never at application boot.
