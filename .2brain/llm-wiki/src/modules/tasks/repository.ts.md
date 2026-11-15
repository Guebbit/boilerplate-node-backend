---
source: src/modules/tasks/repository.ts
sha256: d2b5df9305f51c02ce06d25584bdd409cd261900ad5f3d69b8916e490c314034
generated_at: 2026-11-14T22:09:51.506433+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/repository.ts

## Purpose

The persistence layer for tasks. It wires the Mongoose `taskModel` into the shared repository factory for standard CRUD, then layers on the conditional status moves that lifecycle transitions ("doors") need and the bulk/detach writes that data-erasure needs. Every move is a single `findOneAndUpdate` filtered on the status the caller already read, so two concurrent clicks cannot both win.

## Key elements

- **`base`** — the standard repository built by `createRepository(taskModel, …)`. Declares searchable fields (id, email, text across `name`/`email`/`subject`/`message`) and sortable fields (`createdAt`, `dueAt`, `status`, `email`). Closed-enum fields (`status`, `category`, `kind`, `source`) are deliberately *excluded* from the search spec; the service maps raw strings before passing a scope.
- **`TaskRepository` (interface)** — extends `Repository<TaskDocument, StoredTask>` with domain-specific methods:
  - `moveFrom(id, from, patch)` — apply a transition patch only if the task is still in `from`; returns the post-update doc or `null`.
  - `assign` / `unassign` — set or clear `assigneeId` with status guards (`new → in_progress`, `in_progress → new`).
  - `appendNote` — `$push` a note onto the task's `notes` array.
  - `claimOverdue` / `claimDueSoon` — atomic "claim one unnotified task" writes; sort by `dueAt` ascending; `claimDueSoon` additionally skips contact-kind tasks (except privacy) and requires the task's total lifetime to exceed `DUE_SOON_MS`.
  - `sawEvent` / `insertSystem` / `touchOpen` — system-task dedup: check for a prior event, create a new system task, or bump `seenCount` + trim `eventIds` to the last `REMEMBERED_EVENTS` (20).
  - `findOpenSystem` / `findOpenByKey` — read helpers for the system-task queue.
  - `deleteOwned` / `deleteSystemAbout` / `detachSubject` / `forgetStaff` — erasure operations, all accepting a `ClientSession` to join the caller's transaction.
- **`NewSystemTask` (interface)** — the shape of data handed to `insertSystem`.
- **`taskRepository` (exported const)** — the concrete object spreading `base` and implementing every method above.
- **`REMEMBERED_EVENTS`** — cap (20) for the rolling `eventIds` array kept on a task.
- **`LINKS_THAT_GO_WITH_THE_PERSON`** — list of `TaskLinkType` values whose associated task is deleted (not detached) during erasure.

## Relationships

- **`src/modules/tasks/model.ts`** — imports `taskModel`, `applyTaskTransform`, and the `TaskDocument` / `TaskNoteDocument` types. The repository is the sole consumer of `applyTaskTransform` (used as the factory's `transform` callback).
- **`src/modules/tasks/presenter.ts`** — imports the `StoredTask` type, which is the read-model shape the repository's transform produces and that the `Repository` base type is parameterised with.
- **`src/modules/tasks/domain/index.ts`** (and its sub-modules `lifecycle.ts`, `ownership.ts`) — imports `OPEN_STATUSES`, `DUE_SOON_MS`, `OwnTasksFilter`, and `TaskPatch`. `TaskPatch` is the payload shape for `moveFrom`; `OwnTasksFilter` drives `deleteOwned`.
- **`src/infrastructure/persistence/create-repository.ts`** — imports `createRepository`, `toObjectId`, and the `Repository` base type.
- **`src/infrastructure/persistence/conditional-status.ts`** — imports `updateStatusIfIn` (aliased `conditionalStatus`), used inside `assign` to guard the `new → in_progress` transition.
- **`src/modules/tasks/services/*.ts`** (`read`, `remove`, `workflow`, `system`, `contact`, `overdue`, `personal-data`) — these are the primary callers of `taskRepository`; each service method delegates persistence to one or more of the methods listed above.
- **`src/modules/tasks/tests/factories.ts`** — provides test fixtures that conform to `TaskDocument` / `NewSystemTask` shapes used when exercising this repository in tests.

## Notes

- **Conditional writes are the concurrency contract.** `moveFrom`, `claimOverdue`, and `claimDueSoon` each combine the guard filter and the mutation in a single `findOneAndUpdate`. Callers must treat a `null` return as "someone else won" and not retry blindly.
- **`assign` is two-step by design.** It first tries the `new → in_progress` path via `conditionalStatus`; if that returns `null` it falls back to re-pointing the assignee on an already-`in_progress` task. Both steps honour an optional `ClientSession`.
- **`unassign` is also two-step** (status reset, then `$unset` of `assigneeId`) because Mongoose cannot conditionally unset a field in the same atomic update as a status change.
- **`touchOpen` uses `$push` + `$slice: -20`** to keep the `eventIds` array bounded. The slice is applied on every write, not periodically.
- **`claimDueSoon` skips `TaskKind.contact`** unless the category is `TaskCategory.privacy` — a hard-coded business rule embedded in the query filter, not in the service layer.
- **Erasure methods accept a mandatory `ClientSession`.** They are meant to run inside the caller's transaction; calling them without a session would break the atomicity the erasure flow depends on.
- **`deleteOwned` resolves to the deleted `_id` strings**, not just a count, because the caller needs the ids for downstream bookkeeping.
