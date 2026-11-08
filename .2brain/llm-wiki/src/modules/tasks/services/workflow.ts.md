---
source: src/modules/tasks/services/workflow.ts
sha256: eacc7c50ceb2dc7b105ddbd4999491d81917e2aebff22b35d579c8232749e247
generated_at: 2026-11-08T08:37:42.597896+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/services/workflow.ts

## Purpose

Write-path service that executes task lifecycle mutations—status transitions (resolve, mark-as-spam, reopen), assignment, unassignment, and note-appending—by applying domain rules from `../domain` through conditional (optimistic-concurrency) repository writes. It exists to centralise the "read-then-write-with-retry" pattern so that concurrent callers produce one success and one 409 rather than silent overwrites.

## Key elements

- **`DOORS`** – Maps each `Door` (`'resolve' | 'markSpam' | 'reopen'`) to its domain rule function and the corresponding audit action key.
- **`REFUSALS`** – Maps each `TaskRefusal` to its HTTP error code and i18n message key for the 409 response.
- **`move(door, id, context, attempts?)`** – Core transition engine: loads the task, applies the domain rule, performs a conditional `moveFrom` write, and retries up to 3 times on a lost race before returning 409.
- **`assign(id, userId, context)`** – Validates the assignee (`mayBeAssigned`), performs the write, fires the `task.assigned` outbox announcement (skipped for self-assignment), and records an audit entry.
- **`unassign(id, context)`** – Releases the assignee; returns the task regardless of whether someone held it.
- **`addNote(id, body, context)`** – Appends a staff-thread note; permitted even on closed tasks.
- **`loadWorkable(id, context)`** – Gate that 404s out-of-jurisdiction tasks and 403s tasks the caller may not act on.
- **`assignAndAnnounce`** – Wraps `taskRepository.assign` + `announceInTransaction` so the assignment row and its outbox event commit atomically.
- **`superseded(task)`** – Builds a 409 `TASK_SUPERSEDED` response when a reopen collides with an already-open task on the same dedup key (caught as Mongo E11000).
- **`factsOf` / `present`** – Adapt between the Mongoose document, the domain `TaskFacts`, and the caller-facing `Task` wire shape.

## Relationships

- **`@infrastructure/http/response`** – `generateSuccess` / `generateReject` shape every return value.
- **`@infrastructure/i18n`** – `t()` supplies localised error and success messages.
- **`@infrastructure/observability/audit`** – `recordAudit` logs every successful mutation.
- **`@infrastructure/persistence/create-repository`** – `toObjectId` for ID conversion.
- **`@kernel/access/tenant`** – `DEPLOYMENT_TENANT_ID` scopes role lookups and outbox payloads.
- **`@kernel/outbox`** – `announceInTransaction` ties the assignment write and the `task.assigned` event into one transaction.
- **`@modules/access`** – `accessService.rolesOf` checks whether a candidate assignee holds the required permission set.
- **`src/modules/tasks/access.ts`** – `inJurisdiction`, `mayWork`, `roleMayWorkRouteSet` gate every load and assignment.
- **`src/modules/tasks/audit.ts`** – `tasksAuditActions` provides the canonical action names logged to the audit trail.
- **`../domain`** – `resolve`, `markSpam`, `reopen`, `isOpen`, `TaskFacts`, `TaskRefusal`, `Transition` supply the pure rules this service executes.
- **`../repository`** – `taskRepository` performs the conditional writes (`moveFrom`, `assign`, `unassign`, `findOpenByKey`).
- **`../presenter` / `../views`** – `presentTask`, `assigneeNamesOf`, `viewerOf` shape the task for the caller.

## Notes

- **Optimistic concurrency with bounded retry**: `move` retries up to 3 times on a failed conditional write. If all attempts are exhausted it returns a generic 409 (`TASK_ALREADY_OPEN`), not the domain-specific refusal—treat this as a liveness signal, not a state assertion.
- **404 vs 403 distinction**: A task outside the caller's jurisdiction is 404 (hides existence); a task inside jurisdiction the caller lacks permission for is 403. Do not conflate the two in client error handling.
- **Self-assignment is silent**: `assignAndAnnounce` returns an empty event array when `assigneeId === caller.id`, so no outbox row and no notification are produced.
- **Dedupe-key stability on redelivery**: `assignedAt` is captured once inside the announcement builder, guaranteeing the same dedupe key (`task-assigned:<id>:<assignedAt>`) across outbox redeliveries.
- **Reopen + E11000**: A Mongo duplicate-key error on the dedup index is caught specifically for the `reopen` door and translated into a `TASK_SUPERSEDED` 409 that includes the newer task's ID in `details`. Other doors re-throw.
- **Notes on closed tasks are intentional**: `addNote` does not check `isOpen`; the rationale is that post-close context is still valuable to staff.
