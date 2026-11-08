---
source: src/modules/tasks/services/overdue.ts
sha256: f2b896dee2390a34e34e2f2891fbc124f828c32c72fef3a3843c41b52236df5c
generated_at: 2026-11-08T08:37:01.200273+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/services/overdue.ts

## Purpose

Implements the two periodic "reminder sweeps" for open tasks: announcing a task once as `task.overdue` when it passes its due date, and once as `task.due_soon` when it approaches it. Both announcements are written to the outbox inside a transaction so that at-least-once delivery is guaranteed without duplicate claims.

## Key elements

- **`remindOverdue(now?)`** — exported; sweeps all open tasks past their due date, claiming and announcing each as `TASK_OVERDUE`. Returns the count announced.
- **`remindDueSoon(now?)`** — exported; sweeps open tasks due within three days, claiming and announcing each as `TASK_DUE_SOON`. Same contract as `remindOverdue`.
- **`claimAndAnnounce(claim, name)`** — internal; performs one claim-and-stamp + one outbox write in a single Mongoose transaction via `announceInTransaction`. Returns `true` if a task was claimed.
- **`announceAll(claim, name)`** — internal; loops `claimAndAnnounce` until it returns `false`, accumulating the total count.

## Relationships

- **`src/kernel/outbox.ts`** — calls `announceInTransaction`, which atomically runs the claim callback and the outbox row insert within one Mongoose session.
- **`src/modules/tasks/events.ts`** — imports the `TASK_OVERDUE` / `TASK_DUE_SOON` event-name constants and the `taskFactOf` serializer used to build the outbox payload.
- **`src/modules/tasks/repository.ts`** — delegates the conditional claim logic to `taskRepository.claimOverdue(now, session)` and `taskRepository.claimDueSoon(now, session)`; the repository owns the query/`$set` stamp (`overdueNotifiedAt`, `dueSoonNotifiedAt`).
- **`src/modules/tasks/model.ts`** — imports the `TaskDocument` type for the claim callback signature.
- **`src/modules/tasks/service.ts`** — upstream caller; the docstring identifies the "tasks engine" as the owner of these sweeps, meaning the service invokes `remindOverdue` / `remindDueSoon` on its schedule.

## Notes

- Idempotency is achieved by stamping a timestamp on the task (`overdueNotifiedAt` / `dueSoonNotifiedAt`) *within the same transaction* as the outbox insert. A crash rolls back both, so the next sweep re-claims; the receiver is expected to dedupe on `task-overdue:<id>` / `task-due-soon:<id>`.
- `now` is a single `Date` captured per sweep call, so the entire sweep uses one consistent "clock reading" rather than querying the system clock per task.
- A task that is closed or spam-marked between sweeps will simply not match the repository's claim query and is skipped.
