---
source: scripts/ops/run-job.ts
source_sha256: f04d55e8c1f5c19c953166d9d5fb816b156d8980f83de30df9942503fd51e492
context_sha256: d555221a316cd1d8f249ae178271f77676dbd6d0a1529eeb94d7197b69e35652
generated_at: 2026-11-22T02:12:02.233236+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/ops/run-job.ts

## Purpose
The single runner for every scheduled job, invoked as `npm run job <name>` (e.g. `npm run job reap:orders`). It looks up the named job declaration, connects, boots like the app, runs the job (under its lease, if it has one), and records the outcome for `/observability/health`. It is meant to be run from cron (`docker/crontab`, generated from the same declarations), never on boot. With no name or an unknown name it prints the known jobs and exits non-zero.

## Key elements
- `allJobs()`: returns every job this build runs. These are `appJobs` (jobs no module owns) followed by `resolveJobs(enabledModules)`.
- `execute(job)`: runs the job with one of two orderings.
  - By default it calls `startJob()`, then `prepareJob()`, then `runJobWork(job)`.
  - If `job.connectFirst === false`, it runs `runJobWork(job)` first and calls `startJob()` afterwards. This suits a sweep that never needs Mongo, and it skips `prepareJob()`.
- `requestedJob()`: reads one positional argument with `node:util` `parseArgs`. It finds the matching job by `name`, and if none matches it logs `Unknown job ...` plus the known names and calls `process.exit(1)`.
- Module-level `job`: the job resolved at import time via `requestedJob()`.
- Entry point: calls `boundQueueRetries()`, then `void runScript(...)`.
  - The name recorded is `undefined` for leased jobs and `job.name` otherwise.
  - The work is `execute(job)`.
  - Cleanup is `Promise.all([stopDatabase(), stopQueue(), stopPubSub()])`.

## Relationships
- `src/app/jobs.ts` (`appJobs`) and `src/modules.ts` (`enabledModules`) supply the declarations. `resolveJobs` in `src/kernel/registry.ts` extracts each module's jobs and defines the `JobDeclaration` type.
- `scripts/ops/prepare-job.ts` provides `prepareJob` (the app-like boot) and `runJobWork` (the work itself).
- `scripts/run-script.ts` provides `runScript`, which wraps execution and records the outcome.
- `src/infrastructure/runtime/database.ts` provides `startJob` (connect) and `stopDatabase`.
- `src/infrastructure/adapters/queue.ts` provides `boundQueueRetries` and `stopQueue`.
- `src/infrastructure/adapters/pubsub.ts` provides `stopPubSub`.
- `src/infrastructure/config/dotenv.ts` and `src/infrastructure/runtime/mongoose-boot.ts` are imported for their side effects only.

## Notes
- Import order matters. `mongoose-boot` must load before any model, because Mongoose defaults are read at schema build.
- Job processes have no forced-exit deadline, so `boundQueueRetries()` makes them give up on a dead broker instead of retrying forever.
- Leased jobs record their outcome through their own lease document, so a skipped run is not reported as a success. For these, `runScript` receives `undefined` as the name.
- Jobs are idempotent, so a missed or overlapping cron run costs nothing.
- The job lookup happens at module load, so an invalid name exits before anything runs.
- The `no-floating-promises` ESLint rule is disabled on the `runScript` call because `runScript` never rejects (failure is reported via `process.exitCode`).
