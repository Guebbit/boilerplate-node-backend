---
source: src/modules/tasks/repository.ts
sha256: ad6af7abee58079e7103f38b0a1366c037a4af8d296a5cd900ca8a4ff3117012
generated_at: 2026-11-08T08:36:16.402886+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/repository.ts

## Purpose

Task repository: standard CRUD via the shared repository factory, plus the domain-specific atomic status transitions ("moves"), bulk writes for data-erasure, and single-claim operations for overdue and due-soon reminders. Every write that could race is expressed as one conditional `findOneAndUpdate` so two concurrent callers cannot both succeed.

## Key elements

- **`taskRepository`** (exported singleton) — implements `TaskRepository`; spreads `base` and adds all domain methods.
- **`base`** (internal) — built with `createRepository(taskModel, { transform: applyTaskTransform, searchable: … })`; defines the searchable/sortable field map. `status`, `category`, `kind`, `source` are deliberately excluded (they are domain-enum decisions, not raw-searchable).
- **`TaskRepository`** (exported interface) — extends `Repository<TaskDocument, StoredTask>` with `moveFrom`, `assign`, `unassign`, `appendNote`, `claimOverdue`, `claimDueSoon`, `sawEvent`, `insertSystem`, `touchOpen`, `findOpenSystem`, `findOpenByKey`, `deleteOwned`, `deleteSystemAbout`, `detachSubject`, `forgetStaff`.
- **`NewSystemTask`** (exported interface) — the shape a system task is created with (`kind`, `routeSet`, `openKey`, `link`, `dueAt`, optional `eventId`, `noDueSoon`, etc.).
- **`REMEMBERED_EVENTS`** (= 20) — cap on the `eventIds` array, enforced via `$push { $slice: -20 }` in `touchOpen`.
- **`LINKS_THAT_GO_WITH_THE_PERSON`** — `[TaskLinkType.user, TaskLinkType.export]`; used during erasure to decide which system tasks are deleted vs. detached.
- **`moveFrom(id, from, patch)`** — single `findOneAndUpdate` filtered on `{ _id, status: from }`; returns the updated doc or `null` if the status already changed.
- **`claimOverdue(now, session?)`** / **`claimDueSoon(now, session?)`** — atomic "claim one" writes that stamp `overdueNotifiedAt` / `dueSoonNotifiedAt`; sorted by `dueAt: 1` for FIFO delivery order. `claimDueSoon` uses `$expr` to skip tasks whose entire lifetime was shorter than `DUE_SOON_MS`.
- **`deleteOwned`, `deleteSystemAbout`, `detachSubject`, `forgetStaff`** — all accept a `ClientSession` so they join the caller's erasure transaction.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — supplies `createRepository`, `toObjectId`, and the base `Repository` type; `base` is its return value.
- **`src/modules/tasks/model.ts`** — provides `taskModel` (the Mongoose model used by every method) and `applyTaskTransform` (the projection applied to every read).
- **`src/modules/tasks/domain/index.ts`** — re-exports `DUE_SOON_MS`, `OPEN_STATUSES`, `OwnTasksFilter`, and `TaskPatch` used by the claim and move methods.
- **`src/modules/tasks/domain/lifecycle.ts`** — defines the status-transition rules that callers (services) validate before invoking `moveFrom` / `assign` / `unassign`.
- **`src/modules/tasks/domain/ownership.ts`** — defines ownership predicates consulted by `deleteOwned`, `detachSubject`, `forgetStaff`.
- **`src/modules/tasks/presenter.ts`** — supplies the `StoredTask` projection type.
- **`src/modules/tasks/services/overdue.ts`** — calls `claimOverdue` and `claimDueSoon` in its sweep loop.
- **`src/modules/tasks/services/system.ts`** — calls `sawEvent`, `insertSystem`, `touchOpen`, `findOpenByKey`, `findOpenSystem`.
- **`src/modules/tasks/services/workflow.ts`** — calls `moveFrom`, `assign`, `unassign`, `appendNote`.
- **`src/modules/tasks/tests/integration/*.test.ts`** — exercise the claim, ownership, model, and export paths through this repository.

## Notes

- **Atomicity contract:** `moveFrom`, `claimOverdue`, `claimDueSoon` are each a *single* `findOneAndUpdate`. Callers must not split them; the `null` return is the "lost the race" signal.
- **`assign` is two-phase:** it first attempts `new → in_progress`; if the doc is already `in_progress` it only sets `assigneeId`. This is intentional (re-assignment) but means the method is *not* a single atomic step.
- **`unassign` is two-phase:** `updateOne` (status back to `new`) followed by `findOneAndUpdate` (unset `assigneeId`). The second call is unconditional on status, so a concurrent re-assign between the two steps is possible — callers are expected to serialize.
- **`deleteOwned` fetches-then-deletes** (`.find` → `.deleteMany({_id: {$in: ids}})`) within one session, because `deleteMany` alone only returns a count.
- **`eventIds` is bounded** to the last 20 entries; `touchOpen` uses `$push` + `$slice: -REMEMBERED_EVENTS` to enforce this on every write.
- **Searchable spec omits enums:** `status`, `category`, `kind`, `source` are never in the search index; the service layer maps user input to those enums before calling `moveFrom` or filtering in `findOpenSystem`.
