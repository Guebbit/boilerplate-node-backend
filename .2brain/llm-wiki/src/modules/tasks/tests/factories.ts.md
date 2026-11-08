---
source: src/modules/tasks/tests/factories.ts
sha256: 8ae9c58dd43b4116d1e505a8ad212f2a07bddd9e8b3c6423b7bcc861460bf795
generated_at: 2026-11-08T08:38:07.681449+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/factories.ts

## Purpose

Test-only factory helpers that write directly to the task database, bypassing the service/domain layer. They exist so integration and contract tests across tasks, notifications, shop-tasks, and account can seed realistic task state (open, overdue, resolved) without exercising production business rules.

## Key elements

- **`createSystemTask(subjectId?)`** — Persists an open `export_failed` system task routed to `UserErasure`; `subjectId` is optional.
- **`createSystemTaskAbout(link, subjectId)`** — Same shape as above but always includes a `link` record reference and a required `subjectId`.
- **`backdateDue(id, hoursAgo = 1)`** — Sets a task's `dueAt` to the past (or future if `hoursAgo` is negative) to simulate elapsed time.
- **`giveLife(id, dueInDays, lifeDays)`** — Sets both `dueAt` and `createdAt` so a task appears to have been open for `lifeDays` with a deadline `dueInDays` from now.
- **`closeDirectly(id)`** — Marks a task `resolved` with `resolution: staff` directly in storage.
- **`findAllTasks()`** — Returns every task ordered by `createdAt` ascending.
- **`findTasksOfKind(kind)`** — Returns tasks filtered by `TaskKind`.

## Relationships

- **`src/modules/tasks/model.ts`** — Imports the `TaskDocument` type and the Mongoose `taskModel`; all mutation/read helpers operate on `taskModel` directly.
- **`src/modules/tasks/repository.ts`** — Imports `taskRepository`; the two `create*` factories call `taskRepository.create` rather than the raw model.
- **`src/domain-primitives/time.ts`** — Imports `DAY_MS` and `HOUR_MS` constants for deadline arithmetic.
- **`src/infrastructure/persistence/create-repository.ts`** — Imports `toObjectId` to convert string IDs into Mongo ObjectIds.
- **Consumer tests** (notifications integration, shop-tasks integration, account contract, tasks contract/integration) — Import these factories to seed and inspect task state in their test databases.

## Notes

- Creation goes through `taskRepository.create` (which applies the repository's own logic); mutations and reads use `taskModel` directly. This split means the repository is exercised on write but bypassed on update.
- `giveLife` passes `{ overwriteImmutable: true }` as the Mongoose query option to bypass the default immutability of `createdAt` (see Mongoose timestamps docs). Without it the update would silently fail.
- All time manipulation is relative to `Date.now()` at call time — tests that assert exact timestamps must account for the call-site clock.
