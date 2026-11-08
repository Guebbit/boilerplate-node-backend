---
source: src/modules/tasks/services/system.ts
sha256: 416d5884033eaa591e4d8c83fa36932bb7374c1c66fb49b127350001808c15c4
generated_at: 2026-11-08T08:37:20.233822+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/services/system.ts

## Purpose

Handles the system-driven side of the task lifecycle: opening a task when a domain event flags a situation (account review flag, export failure) and clearing it when the situation resolves. Every operation is idempotent and ownership-free — the system acts on behalf of the platform, not a human, so there is no permission gate.

## Key elements

- **`openSystemTask(opening, meta)`** – Inserts one system task (keyed by `openKey`) and publishes a `task.opened` outbox row atomically. Idempotent: a redelivered `eventId` short-circuits; a duplicate `openKey` rolls back and falls through to a no-op `touchOpen`.
- **`clearSystemTasks(kinds, link, note?)`** – Public entry point that resolves a set of `TaskKind` values against a record link, then delegates to `clearMatching`. No permission check by design.
- **`clearMatching(filter, note?)`** – Finds all open system tasks matching `filter`, then conditionally moves each from its current status to `cleared`. Appends a system note if one is supplied. A concurrent staff close wins; this one no-ops.
- **`guarded(name, work)`** – Catches a handler error, logs it via `logger.error`, and **rethrows** so the outbox redelivers. A missed open would be a silently lost task.
- **`userWork(userId)`** – Builds the staff-frontend URL for a user page using `FRONTEND_LINK_RULES`.
- **`systemTasks`** (exported object) – The four event handlers that `module.ts` subscribes:
  - `onReviewFlagged` → opens an `account_review` task
  - `onReviewCleared` → clears the `account_review` task for that user
  - `onExportFailed` → opens an `export_failed` task
  - `onExportReady` → clears prior `export_failed` tasks for that user

## Relationships

| Neighbor | Interaction |
|---|---|
| `@infrastructure/adapters/logger` | `guarded` logs handler failures before rethrowing. |
| `@infrastructure/observability/audit` | `recordAudit` is called **after** a successful commit (open) or per-task move (clear). |
| `@infrastructure/persistence/mongo-errors` | `isDuplicateKey` distinguishes a race on `openKey` from a real error. |
| `@infrastructure/http/frontend-link` | `fillPath` + `FRONTEND_LINK_RULES` build the `work` URL stored on the task. |
| `@kernel/outbox` | `announceInTransaction` couples the task insert and the `task.opened` outbox row in one session. |
| `@kernel/events` | `DomainEventMap` / `DomainEventMeta` types shape handler signatures. |
| `@kernel/permissions` | `systemCallerContext('Task')` supplies the audit actor identity. |
| `../domain` (index → `domain/system.ts`, `domain/lifecycle.ts`) | Provides `SystemOpening`, `accountReviewOpening`, `exportFailedOpening`, `openKeyOf`, `clear`. |
| `../events` | `TASK_OPENED` event name and `taskFactOf` payload mapper for the outbox row. |
| `../repository` | All MongoDB reads/writes (`insertSystem`, `touchOpen`, `sawEvent`, `findOpenSystem`, `moveFrom`, `appendNote`). |
| `../audit` | `tasksAuditActions` enum values for audit records. |
| `../module.ts` | Subscribes the four `systemTasks` handlers to the event bus (the consumer side of this file's exports). |

## Notes

- **Audit timing is deliberate.** `recordAudit` runs *after* the `announceInTransaction` promise resolves. Recording inside the transaction would produce an audit line for a row that might roll back.
- **`clearMatching` is per-task, not bulk.** Each task gets its own conditional `moveFrom(id, fromStatus, clear(now))`. This is what lets a simultaneous staff close win without a lock.
- **`guarded` always rethrows.** Swallowing the error would stop the outbox from redelivering, turning a transient failure into a permanent lost task.
- **`openSystemTask` short-circuits on `sawEvent`.** The `eventId` dedup check happens *before* the insert attempt, avoiding an unnecessary write and audit entry on replay.
- **Optional fields (`work`, `subjectId`, `noDueSoon`)** are conditionally spread into the insert object to keep the stored document free of `undefined` keys.
