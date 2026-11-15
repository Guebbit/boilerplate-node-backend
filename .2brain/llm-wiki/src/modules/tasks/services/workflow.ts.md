---
source: src/modules/tasks/services/workflow.ts
sha256: 0cd75384349ec76fc1904623508c4329e35bbff3093f95060e08868cdec06d16
generated_at: 2026-11-14T22:13:04.576349+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/services/workflow.ts

## Purpose

The write path for every status-changing task operation: resolve, mark-as-spam, reopen, assign, unassign, and the staff badge counts. Each mutation is a single conditional write (`moveFrom`) filtered on the status the caller read, so concurrent clicks yield exactly one 200 and one 409. Domain rules live in `../domain`; this file orchestrates the read → decide → write → audit → present sequence around them.

## Key elements

- **`Door` / `DOORS`** — Union of the three lifecycle transitions (`resolve`, `markSpam`, `reopen`) mapped to their domain rule function and audit action key.
- **`REFUSALS`** — Maps each `TaskRefusal` to its HTTP error code and i18n message key (all 409s).
- **`move(door, id, context, attempts?)`** — Core conditional-write loop. Loads the task, evaluates the domain rule, issues `taskRepository.moveFrom(id, readStatus, patch)`. On a lost race (0 rows updated) retries up to 3 times; on an `isDuplicateKey` error during reopen, checks for a superseding open task and returns 409 `TASK_SUPERSEDED`.
- **`loadWorkable(id, context)`** — Loads a task and enforces jurisdiction (404) and permission (403) before any write. Out-of-jurisdiction tasks are indistinguishable from missing ones.
- **`factsOf(task)`** — Projects a `TaskDocument` into the minimal `TaskFacts` shape the domain rules consume.
- **`present(task, context)`** — Resolves assignee display names and adds the caller's available actions before returning the wire shape.
- **`mayBeAssigned(userId, routeSet)`** — Validates a proposed assignee: user exists, is not deleted, and holds the route-set permission plus `update:Task`.
- **`assignAndAnnounce(id, assigneeId, context)`** — Writes the assignment and the `TASK_ASSIGNED` outbox event atomically via `announceInTransaction`. Self-assignment (no actor credential) suppresses the announcement.
- **`assign(id, userId, context)`** — Full assign flow: load → open check → repeat-assign guard → eligibility → `assignAndAnnounce` → audit.
- **`unassign(id, context)`** — Releases the assignee in any status; `in_progress` reverts to `new`; 409 if unassigned.
- **Rejection helpers** — `notOpen()`, `notAssigned()`, `alreadyAssigned()`, `notFound()`: pre-built 409/404 responses.

## Relationships

- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape every return value.
- **`src/infrastructure/i18n/index.ts`** — `t()` localises all user-facing error messages.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes an audit row after each successful mutation.
- **`src/infrastructure/persistence/mongo-errors.ts`** — `isDuplicateKey` detects the reopen-superseded race condition.
- **`src/infrastructure/persistence/create-repository.ts`** — `isObjectIdString`, `toObjectId` for id validation/parsing.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` scopes the access check in `mayBeAssigned`.
- **`src/kernel/outbox.ts`** — `announceInTransaction` wraps assignment + event publication in one DB transaction.
- **`src/modules/access/services/index.ts`** — Provides `accessService` used to fetch the assignee's tenant roles for the permission check.
- **`src/modules/tasks/access.ts`** — `inJurisdiction`, `mayWork`, `roleMayWorkRouteSet` gate every load and assign decision.

## Notes

- **Optimistic concurrency, not locking.** `moveFrom` filters on the previously-read status; if another write landed first, the update affects 0 rows and the loop retries (max 3) or returns 409. There is no `findAndModify` or row lock.
- **404 for out-of-jurisdiction.** `loadWorkable` returns `notFound()` (404) when the task is outside the caller's jurisdiction, so an attacker cannot enumerate tasks they cannot see. A 403 is only returned when the task *is* in jurisdiction but the caller lacks the specific permission.
- **Reopen dedup key.** `superseded()` checks `findOpenByKey(kind:linkType:linkId)` — a reopen is rejected if a newer open task already exists on the same dedup key, and the response includes the newer task's `_id` in `details`.
- **`assignedAt` in the outbox payload.** The timestamp is generated once at announcement time and stored in the outbox row; the receiver's dedupe key (`task-assigned:<id>:<assignedAt>`) is therefore stable across redeliveries.
- **Self-assign is assignment, not notification.** When `context.actorCredentialId` is undefined (the caller is the assignee), no outbox event is written — the person already knows they took the task.
- **Truncated file.** The `unassign` body and any "add note" / badge-count functions are below the visible cutoff; the module doc-comment and imports imply they exist in the same file.
