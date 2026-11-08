---
source: src/modules/tasks/jobs.ts
sha256: 3ba71e9c883484ad9fcf8aeed8075da0d0dffc82457e3e6389b179424d9ee171
generated_at: 2026-11-08T08:34:32.158578+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/jobs.ts

## Purpose

Declares the scheduled job(s) owned by the `tasks` module. Currently a single job — the **sweep** — which reminds staff of overdue tasks and tasks due soon, then flushes the resulting outbox nudges before the process exits.

## Key elements

- **`tasksJobs`** (exported `readonly JobDeclaration[]`) – The job registry entry for this module. Contains one declaration built from `tasksJobData.sweepTasksOverdue` (imported from `./jobs.generated`):
  - **`run`** – Fires `taskService.remindOverdue()` and `taskService.remindDueSoon()` concurrently via `Promise.all`, then calls `settleOutboxNudges()` so the outbox rows are delivered before the process exits, and finally logs a summary (`overdue` / `dueSoon` counts) via `logger.info`.
  - **`needs`** – `{ subscriptions: true, i18n: true }`; the job only writes `task.overdue` / `task.due_soon` rows and relies on the `notifications` subscription and translation lookups for delivery.
  - **`lease`** – `{ ttlMs: 30 * MINUTE_MS }`; ensures a single sweep runs at a time.

## Relationships

- **`src/modules/tasks/service.ts`** – Calls `taskService.remindOverdue()` and `taskService.remindDueSoon()`, the two reminder passes that produce the outbox rows.
- **`src/kernel/outbox.ts`** – Calls `settleOutboxNudges()` to flush pending nudge rows before the job completes.
- **`src/kernel/registry.ts`** – Supplies the `JobDeclaration` type that shapes each entry in `tasksJobs`.
- **`src/domain-primitives/time.ts`** – Imports `MINUTE_MS` to express the 30-minute lease TTL.
- **`src/infrastructure/adapters/logger.ts`** – Imports `logger` for the completion info line.
- **`tests/integration/ops-task-overdue-job.test.ts`** – Integration test that exercises this sweep job end-to-end.

## Notes

- Both passes (overdue + due-soon) are deliberately combined into **one** job because a task is due-soon *or* overdue, never both; splitting them would only add complexity.
- The `settleOutboxNudges()` call is a best-effort in-process flush; a separate "minute backstop" (outside this file) catches any nudge rows that are still pending after the job returns.
- The job does **not** send notifications or render staff mail itself — it writes task-status rows and depends on the `notifications` subscription and i18n translations to do the actual delivery.
