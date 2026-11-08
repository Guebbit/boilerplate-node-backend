---
source: src/modules/notifications/tests/integration/task-overdue.test.ts
sha256: 9b72501054b9e83ae96c8d9acec4f8588289eb5650bd281337e4c8596b38ffc7
generated_at: 2026-11-08T06:36:24.663439+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/integration/task-overdue.test.ts

## Purpose

Integration test that drives the overdue-task reminder end-to-end the same way production does: a task is created, its due date backdated, and the tasks sweep (`remindOverdue`) executed. It verifies the reminder reaches the same audience as the original opener (bell notification + email), is delivered exactly once, is suppressed for closed tasks, and falls back to the support mailbox (or to nobody) when no qualified recipient exists.

## Key elements

- **`staff(role, email)`** — local helper that creates a user via `createUser` with `authenticatorEnabledAt` set, so the user qualifies as "tellable."
- **`overdueBellOf(role, userId)`** — calls `notificationsService.listVisible` with a `callerInScope` in the deployment tenant, then filters to `notifications.staff.task-overdue` items.
- **`overdueMails()`** — inspects the mocked `enqueueEmail` calls and returns only those using the `notifications.staff-notice` template with an "Overdue" subject.
- **`mailboxMails()`** — inspects mocked `enqueueEmail` calls for the `tasks.contact` template (the support-mailbox fallback).
- **`overdueContact()`** — creates a contact task via `taskService.create`, settles the outbox (so the opener's notice lands), backdates the due date, clears the mail log, and returns the task.
- **`describe("an overdue contact task")`** — four tests: correct audience + single reminder, idempotency on duplicate event, suppression after close, and fallback to the support mailbox when no one is tellable.
- **`describe("an overdue system task")`** — two tests: the task's own route-set audience receives the bell/mail, and when no one holds the set nothing is sent (not even the main mailbox).

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is fully mocked; all assertions about mail delivery read from its mock calls.
- **`src/modules/tasks/index.ts` / `src/modules/tasks/service.ts`** — `taskService.remindOverdue()` is the production entry point under test; `taskService.create` builds the contact task.
- **`src/modules/tasks/tests/factories.ts`** — provides `backdateDue`, `closeDirectly`, and `createSystemTask` to manipulate task state between steps.
- **`src/modules/notifications/services/index.ts`** — `notificationsService.listVisible` is the query under test; `notificationsService.onTaskOverdue` is called directly in the idempotency test.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` flushes pending outbox deliveries so the opener's notice is accounted for before the reminder is asserted.
- **`src/kernel/events.ts`** — `resetDomainEvents()` isolates each test's event bus.
- **`src/kernel/registry.ts`** — `registerModules(enabledModules)` wires the module graph before each test.
- **`src/modules.ts`** — supplies the `enabledModules` array for registration.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` scopes all callers and notifications to the single-tenant deployment.
- **`src/kernel/permissions.ts`** — `callerInScope` builds the permission-scoped caller passed to `listVisible`.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds test users (with or without authenticator).
- **`tests/support/callers.ts`** — `asRole` constructs a role-scoped caller identity.
- **`tests/support/environment.ts`** — `setEnvironment` sets `NODE_SUPPORT_EMAIL` for the fallback-mailbox address.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the test database once.

## Notes

- The test mocks the **queue** (`enqueueEmail`), not the transport — assertions are on what was enqueued, not what was sent.
- `overdueContact()` deliberately calls `settleOutboxNudges()` *before* clearing the mail log so the opener's notice is absorbed into the "before" state and does not pollute the reminder assertions.
- The "nobody can be told" fallback test creates a user **without** `authenticatorEnabledAt`, which is the condition that disqualifies them from direct delivery and triggers the mailbox fallback.
- The system-task "goes nowhere" test asserts `remindOverdue()` resolves to `1` (one overdue task was found) while asserting zero mail calls — the count and the delivery are separate concerns.
- The idempotency test calls `notificationsService.onTaskOverdue` directly (not via the sweep) to isolate the notification handler's deduplication logic from the sweep's task-query logic.
