---
source: src/modules/tasks/tests/integration/workflow.test.ts
sha256: 4bcf48cd568934ef0a1479c030fbb745167f58d007856f9a7e6423453cdac0e5
generated_at: 2026-11-14T22:17:33.586706+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/integration/workflow.test.ts

## Purpose
Integration test suite that exercises the full task lifecycle moves — resolve, markSpam, reopen, assign, unassign — against a real database. It pins the state stamps each move writes (`closedAt`, `resolution`, `respondedAt`, `openKey`), the 409/404/422 error codes and their codes, jurisdiction (route-set) enforcement, dedup-key release/restoration, and outbox event emission. It exists so regressions in any of those contracts are caught at the integration boundary.

## Key elements
- **`admin` / `support`** — caller-context fixtures built with `callerContextAs`; `admin` holds every route set, `support` holds contact-message sets but not `UserBanning`.
- **`fileContact()`** — creates a visitor contact-message task through `taskService.create`.
- **`openReviewTask(link?)`** — creates a system `account_review` task directly via `taskRepository.create`, carrying an `openKey` and `dueAt`.
- **`stored(id)` / `storedField(id, key)`** — read a task (or one field) back from the repository to assert persisted state.
- **`describe('resolve')`** — asserts `closedAt`/`respondedAt` stamps, dedup-key release, 409 `TASK_ALREADY_RESOLVED` on repeat, spam→resolve preserves original `closedAt`, single-winner under concurrent resolve, 404 on unknown id.
- **`describe('markSpam')`** — asserts `resolution: 'spam'`, `respondedAt` untouched, 409 `TASK_ALREADY_SPAM`.
- **`describe('reopen')`** — asserts status transitions (new vs in_progress), `closedAt`/`resolution` cleared, dedup key restored, `dueAt` preserved, 409 `TASK_ALREADY_OPEN`, and 409 `TASK_SUPERSEDED` when a newer task holds the key.
- **`describe('jurisdiction')`** — verifies a caller outside the task's route set gets 404 on read and write, and that search results exclude out-of-set tasks.
- **`describe('assign and unassign')`** — verifies the outbox row is written atomically with the assign state change; self-assignment via direct auth emits no outbox row while the same action via `actorCredentialId` (key) does; 422 for a worker outside the route set.
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces the audit port module wholesale with `auditPortMock()` from `tests/support/ports.ts` (replaced, not spied on).

## Relationships
- **`src/modules/tasks/services/index.ts`** — `taskService` is the system under test; every action under assertion flows through it.
- **`src/modules/tasks/repository.ts`** — `taskRepository` is used to seed system tasks and to read persisted state (`stored`, `storedField`).
- **`src/modules/tasks/model.ts`** — `TaskDocument` type parameterises the `storedField` helper.
- **`src/modules/tasks/audit.ts`** — `tasksAuditActions` is imported (referenced by the service under test); the audit port it calls into is mocked at the module level.
- **`src/infrastructure/observability/audit.ts`** — replaced at module load time by `auditPortMock()` from `tests/support/ports.ts`; tests assert audit rows written per move.
- **`src/kernel/outbox.ts`** — `outboxEventModel` is queried to verify the outbox event rows for the assign action (or their absence).
- **`src/modules/users/tests/factories.ts`** — `createUser` creates test workers with specific roles.
- **`src/types/index.ts`** — provides `TaskKind`, `TaskLinkType`, `TaskSource`, `TaskStatus` enum values used in fixtures and assertions.
- **`tests/support/callers.ts`** — `callerContextAs` builds the admin/support caller objects.
- **`tests/support/ports.ts`** — `auditPortMock` supplies the mock audit port; `observePort` is imported (available for port-level assertions).
- **`tests/support/response.ts`** — `asSuccess` / `asReject` unwrap the result envelope for clean assertions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` provisions a real MongoDB for the test run.

## Notes
- The audit port is **replaced**, not spied on. The `jest.mock` factory calls `auditPortMock()` from `tests/support/ports.ts`, so any code path that imports the real port module receives the mock. If you add new audit assertions, use the port-mock API from `ports.ts`, not `jest.spyOn`.
- `stored` uses a non-null assertion (`found!`); it will throw at runtime if the id is missing rather than returning a typed error.
- The concurrent-resolve test (`Promise.all` of two resolves) relies on the service's internal guard, not on DB-level constraints. If the service's guard changes, this test is the canary.
- Self-assignment (caller id === assignee, no `actorCredentialId`) intentionally produces **no** outbox row. The key-mediated path (same user, with `actorCredentialId`) **does** emit. This is a deliberate product distinction, not an oversight.
- `setupTestDb()` is called at module scope (not in `beforeAll`), so the database is ready before any `describe` block registers its hooks.
