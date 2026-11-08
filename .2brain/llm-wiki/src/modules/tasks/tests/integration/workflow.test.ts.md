---
source: src/modules/tasks/tests/integration/workflow.test.ts
sha256: c78b8dca1129254bddcde2b01254c3f9f7550164d053acdaa920837191e866d4
generated_at: 2026-11-08T08:41:05.522698+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/workflow.test.ts

## Purpose

Integration test that exercises every state-moving operation on a task (resolve, markSpam, reopen, assign, unassign) against a real database. It pins the field stamps each move must write (`closedAt`, `resolution`, `respondedAt`, `openKey` dedup), the 409 contract on idempotent repeats, the reopen/supersede collision, jurisdiction gating (404 for out-of-set callers), and the outbox + audit side-effects each move produces.

## Key elements

- **`fileContact()`** – Creates a visitor contact-message task via `taskService.create` (the common fixture for most tests).
- **`openReviewTask(link)`** – Creates a system `account_review` task directly via `taskRepository.create`, carrying an `openKey` dedup and a future `dueAt`.
- **`stored(id)` / `storedField(id, key)`** – Read-back helpers that fetch the persisted task and (optionally) a single typed field from `TaskDocument`.
- **`describe('resolve', …)`** – Verifies `closedAt`/`respondedAt` stamps, dedup-key release, 409 `TASK_ALREADY_RESOLVED`, spam→resolve preserving original `closedAt`, a concurrent-duplicate race (one 200, one 409), and 404 for a missing id.
- **`describe('markSpam', …)`** – Verifies `resolution: 'spam'`, `respondedAt` unchanged, and 409 `TASK_ALREADY_SPAM` on repeat.
- **`describe('reopen', …)`** – Verifies status reset (new / in_progress), `closedAt`/`resolution` cleared, `openKey` + `dueAt` restored, 409 `TASK_ALREADY_OPEN`, and 409 `TASK_SUPERSEDED` naming the newer task.
- **`describe('jurisdiction', …)`** – Confirms both `getById` and `resolve` return 404 for an out-of-set caller, that `search` filters system tasks for non-admins but shows them to admin, and that support can still act on visitor tasks.
- **`describe('assign and unassign', …)`** – Verifies `task.assigned` outbox row, status transition to `in_progress`, assignee name resolution, and 422 `TASK_ASSIGNEE_INVALID` for role-ineligible users (moderator, manager).
- **`jest.mock('@infrastructure/observability/audit')`** – Replaces the audit port entirely with `auditPortMock()` (see `tests/support/ports.ts`), so tests can assert audit calls without a live sink.

## Relationships

- **`src/modules/tasks/service.ts`** – Primary system under test; every assertion drives a `taskService` method.
- **`src/modules/tasks/repository.ts`** – Used directly in helpers (`openReviewTask`, `stored`) to seed system tasks and read back ground truth.
- **`src/modules/tasks/audit.ts`** – `tasksAuditActions` is imported (used by the service internally to tag audit rows).
- **`src/modules/tasks/model.ts`** – `TaskDocument` type drives the generic `storedField` helper.
- **`src/kernel/outbox.ts`** – `outboxEventModel` queried in-DB to assert `task.assigned` event rows.
- **`src/infrastructure/observability/audit.ts`** – Mocked at the module boundary so the real port is never invoked.
- **`src/types/index.ts`** – Enum values (`TaskStatus`, `TaskKind`, `TaskSource`, `TaskLinkType`) used in fixtures and assertions.
- **`src/modules/users/tests/factories.ts`** – `createUser` creates role-specific users (support, moderator, manager) for assign/jurisdiction tests.
- **`tests/support/callers.ts`** – `callerContextAs` builds the `admin` / `support` caller objects.
- **`tests/support/ports.ts`** – Supplies `auditPortMock` and the `observePort` helper.
- **`tests/support/response.ts`** – `asSuccess` / `asReject` unwrap the service result union for clean assertions.
- **`tests/support/setup-test-db.ts`** – Boots a real MongoDB instance for the suite.

## Notes

- **Real DB, mocked port.** The repository is *not* mocked; only the audit observability port is replaced. This means tests are true integration tests and will surface schema or query regressions.
- **Race-condition test.** The "exactly one of two simultaneous clicks" case fires two `resolve` calls via `Promise.all`; passing requires a database-level guard, not just in-process state.
- **`storedField` is generic over `TaskDocument` keys**, so a typo in a field name is caught at compile time.
- **Jurisdiction is tested on both read and write paths** and on `search`, not just the individual action—missing any one of those would let a caller leak data via list queries.
- **Assignee role rules are asserted explicitly** (moderator blocked from `account_review`, manager blocked from contact messages), encoding a permission matrix that is otherwise only visible in the service.
