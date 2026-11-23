---
source: src/modules/notifications/tests/integration/task-overdue.test.ts
source_sha256: 7179723b3f95d942837fb4a43bc85ffaba672ec30fb72265d46df5a9eb356550
context_sha256: aec6a31428a66faa9ccced3f3fb33703468a228aeef40dd90359f76a02f22026
generated_at: 2026-11-22T05:58:45.320157+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/tests/integration/task-overdue.test.ts

## Purpose
Integration test for the overdue-task reminder, driven as production does it: a task is opened and alerted, its due date is backdated, then `taskService.remindOverdue()` runs. It checks that the reminder reaches the same people as the opener (bell and mail), only once, never for a closed task, and falls back like the opener when nobody can be told.

## Key elements
- `mockEnqueueEmail`: the mailer's `enqueueEmail` is replaced with a Jest mock, so assertions are on enqueued mail rather than rendered copy.
- `setupTestDb()` plus a `beforeEach` that resets the mock, sets `NODE_SUPPORT_EMAIL` to `desk@example.com`, resets domain events and calls `registerModules(enabledModules)`. `afterEach` resets domain events again.
- `staff(role, email)`: creates a user with the given role and an authenticator app enabled (`authenticatorEnabledAt`), which makes them reachable.
- `overdueBellOf(role, userId)`: lists the user's visible notifications through the notifications service, scoped to the deployment tenant, and keeps only `notifications.staff.task-overdue` items.
- `overdueMails()`: enqueued mails using template `notifications.staff-notice` whose subject starts with "Overdue".
- `mailboxMails()`: enqueued mails using template `tasks.contact` (the support mailbox).
- `overdueContact()`: creates a contact task through the tasks service, settles outbox nudges, backdates its due date and clears the mail log.
- Contact-task cases:
  - Bell rings once for `support` only, not `manager`. No per-person mail goes out, and a single mailbox mail to `desk@example.com` is sent with `replyTo` set to the contact's address, even after two sweeps.
  - Delivering the `onTaskOverdue` event twice yields one bell item.
  - A task closed via `closeDirectly` produces no bell item and no mail.
  - When the only support user has no authenticator armed, the mailbox gets an "Overdue contact request…" mail carrying the original message.
- System-task cases (`createSystemTask`, kind `export_failed`):
  - Only the `moderator` holding the task's route set gets the bell item and the per-person mail. `support` gets neither.
  - With nobody holding the set, `remindOverdue()` resolves to `1` and no mail is enqueued, because there is no main mailbox.

## Relationships
- `@infrastructure/adapters/mailer`: mocked, so the tests observe `enqueueEmail` calls.
- `@modules/notifications/services`: the notifications service is read for the bell, and `onTaskOverdue` is invoked directly with a fact.
- `@modules/tasks` and `@modules/tasks/services`: the tasks service, via `taskService` (`create`, `remindOverdue`), is the code under test.
- `@modules/tasks/tests/factories`: `createSystemTask`, `backdateDue` and `closeDirectly` set up task state.
- `@modules/users/tests/factories`: `createUser` creates staff.
- `@tests/callers`, `@tests/environment`, `@tests/setup-test-db`: supply `asRole`, `setEnvironment` and the database lifecycle.
- `@kernel/access/tenant` (`DEPLOYMENT_TENANT_ID`) and `@kernel/permissions` (`callerInScope`) build the tenant-scoped caller.
- `@kernel/outbox` (`settleOutboxNudges`) waits for outbox delivery. `@kernel/events` (`resetDomainEvents`) and `@kernel/registry` (`registerModules`) with `modules.ts` (`enabledModules`) wire the real module set between tests.

## Notes
- The outbox must be settled after each `remindOverdue()` and after creation, or notifications and mails may not have landed when asserted.
- `overdueContact()` and the system-task cases call `mockEnqueueEmail.mockClear()` after backdating, so only mail from the sweep is counted.
- Reachability depends on an armed authenticator: a user without `authenticatorEnabledAt` is treated as someone who cannot be told, triggering the mailbox fallback.
