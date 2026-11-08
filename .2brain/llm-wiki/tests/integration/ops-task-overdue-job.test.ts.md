---
source: tests/integration/ops-task-overdue-job.test.ts
sha256: 8b6b11058edba4f47b6569c41fca80e5c09df1eef9fb494ec76d79c15d3a29a3
generated_at: 2026-11-08T09:43:12.531811+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/ops-task-overdue-job.test.ts

## Purpose

Integration test that exercises the overdue-task sweep job exactly as the production runner (`npm run job`) would, via `prepareJob`. It verifies that the sweep emits the correct staff notifications (`task-overdue` and `task-due-soon`) and—critically—that nothing is wired up by the test itself; only what the job's own `needs` declaration registers is active. This catches a job that forgets to declare `subscriptions` in its manifest.

## Key elements

- **`describe('the overdue sweep run through the job runner')`** – the test suite; uses `tasksJobs[0]` as the target job.
- **`it('tells the staff who work the task')`** – creates a system task, backdates its due date by 2 days, runs the job, and asserts a `notifications.staff.task-overdue` code appears in the admin's visible notifications.
- **`it('also tells them a task is three days from its deadline')`** – creates a task with `giveLife(2, 10)` (due in 10 days, 2 days elapsed), runs the job, and asserts a `notifications.staff.task-due-soon` code.
- **`beforeEach` / `afterEach`** – both call `resetDomainEvents()` so only the runner's own `prepareJob` call can attach listeners.

## Relationships

- **`scripts/ops/prepare-job.ts`** – `prepareJob(job)` is the entry point the test calls; it installs subscriptions/listeners based solely on the job's declared `needs`. The test's correctness depends on this being the *only* wiring.
- **`src/modules/tasks/jobs.ts`** – exports `tasksJobs`; the test grabs the first element as the overdue-sweep job.
- **`src/modules/tasks/tests/factories.ts`** – `createSystemTask`, `backdateDue`, `giveLife` set up task fixtures.
- **`src/modules/users/tests/factories.ts`** – `createUser` creates the admin account that owns the task.
- **`src/modules/notifications/services/index.ts`** – `notificationsService.listVisible` is the assertion surface (reads what the admin can see).
- **`src/kernel/events.ts`** – `resetDomainEvents` clears all registered listeners before/after each test for isolation.
- **`src/kernel/permissions.ts`** – `callerInScope` wraps the caller in a tenant scope for the notification query.
- **`src/kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` supplies the tenant context.
- **`tests/support/callers.ts`** – `asRole('admin', admin.id)` builds the role-based caller object.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` provides an isolated database for the suite.

## Notes

- The module docblock makes the design intent explicit: the test must *not* register any listeners itself. If a developer adds a `beforeEach` that wires a subscription, the test no longer validates the job's own declaration.
- Both `beforeEach` and `afterEach` call `resetDomainEvents()`. This double-reset guards against async listener registration leaking across test boundaries.
- The test assumes `tasksJobs[0]` is the overdue sweep. If the order in `jobs.ts` changes, this test silently targets the wrong job.
