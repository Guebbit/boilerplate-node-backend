---
source: src/modules/tasks/jobs.ts
sha256: c3a67f12ff2b66c2dccdf5b768788a8100aa6e236bc9685b1df823f78381ee24
generated_at: 2026-11-14T22:08:20.004424+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/jobs.ts

## Purpose

Declares the scheduled job(s) owned by the `tasks` module: a single "sweep" job that fires reminders for overdue and due-soon tasks. It wires the generated job metadata to the actual execution logic and sets the lease window.

## Key elements

- **`tasksJobs`** (`readonly JobDeclaration[]`) — The exported array of job declarations for this module. Currently contains one entry.
- **`sweepTasksOverdue`** (inline in the array) — Spreads pre-generated metadata from `tasksJobData.sweepTasksOverdue` (imported from `./jobs.generated`) and overrides `run` and `lease`.
  - `run` — Calls `taskService.remindOverdue()` and `taskService.remindDueSoon()` concurrently via `Promise.all`, then logs a structured info message with the counts from both passes.
  - `lease` — Sets `ttlMs` to `30 * MINUTE_MS` (30 minutes), ensuring only one sweep runs at a time.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `JobDeclaration` type that shapes each entry in `tasksJobs`.
- **`src/modules/tasks/services/index.ts`** — Exports `taskService`, whose `remindOverdue` / `remindDueSoon` methods are the actual work performed by the job.
- **`src/infrastructure/adapters/logger.ts`** — Provides the `logger` used for the post-sweep info log.
- **`src/domain-primitives/time.ts`** — Provides the `MINUTE_MS` constant used to compute the lease TTL.
- **`src/modules/tasks/module.ts`** — The module entry point that registers `tasksJobs` into the kernel.
- **`tests/integration/ops-task-overdue-job.test.ts`** — Integration test exercising the overdue-reminder path of this job.

## Notes

- The job file is intentionally thin: all scheduling metadata (cron/schedule, names) lives in `jobs.generated.ts`. The hand-written file only supplies `run` and `lease`.
- Both reminder passes run in a **single** job invocation. The inline comment clarifies the design intent: a task is "due soon" or "overdue", never both, so one job covers both without double-firing.
- `tasksJobs` is typed `readonly`; consumers should treat it as immutable.
