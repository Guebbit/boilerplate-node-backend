---
source: src/modules/notifications/tests/integration/task-alerts.test.ts
source_sha256: fc61ae467a2535d5eb4fca6c91ac1d5f3b3dd1e933323d746c9fae2b7efd7290
context_sha256: 2ed7f9d2632bd2759bd3d85b26feb8f1b4160f327130ae13699c1d352257cfa3
generated_at: 2026-11-22T05:58:17.284939+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/tests/integration/task-alerts.test.ts

## Purpose
Integration test suite for task alerts, run the way production runs them: the real modules are registered, and a contact message is filed through `taskService` (or a task is handed to a colleague) at one end, with the notification bell and mock mailboxes checked at the other. It covers who is told about a task (the people whose role grants the task's route set), what per-person mail may contain (a category and a link, never the visitor's words), and that a contact message gets no per-person mail, only a full copy to the main support mailbox.

## Key elements
- `jest.mock('@infrastructure/adapters/mailer')`: replaces `enqueueEmail` with a `jest.fn()`. Tests assert on the mail queue, not on rendered copy.
- `mockEnqueueEmail`: the typed mock, reset in `beforeEach` and defaulted to resolve `undefined`.
- `setupTestDb()`: provides the test database.
- `beforeEach` / `afterEach`: set `NODE_SUPPORT_EMAIL=desk@example.com`, call `resetDomainEvents()`, and call `registerModules(enabledModules)`. `afterEach` resets domain events again.
- `staff(role, email, locale?)`: creates a user with the given role and an authenticator app enabled (`authenticatorEnabledAt`), so the user counts as able to act.
- `bellOf(role, userId)`: calls `settleOutboxNudges()`, then reads `notificationsService.listVisible` as that user in the deployment tenant and returns `items`.
- `fileContact(category?)`: creates a contact task through `taskService.create` with sensitive text, then settles the outbox.
- `noticeMails()`: filters enqueued mails by template `notifications.staff-notice` (per-person mail).
- `mailboxMails()`: filters enqueued mails by template `tasks.contact` (support mailbox mail).
- `handOver()`: creates two admins and a system task via `createSystemTask`, returning `{ giver, taker, id }`.
- `describe('a contact message')`: checks the following.
  - Support and admin are told, but a manager is not.
  - The bell rings but no person is mailed.
  - The mailbox mail carries the full message, a category label (`Personal data`, or `Uncategorised` when none is given), and `replyTo` set to the visitor.
  - The mailbox is mailed once even when nobody can be told by name.
  - A spam submission (with `website` set) enqueues nothing.
  - Repeated `onTaskOpened` delivery notifies only once.
- `describe('a system task')`: calls `onTaskOpened`, `onTaskDueSoon` and `onTaskOverdue` directly with a fact object (`tenantId`, `taskId`, `kind`, `routeSet`, optional `work`). It checks the following.
  - Only holders of the task's own route set are told, and they get a per-person mail.
  - The contact mailbox is never mailed.
  - The `work` path becomes the link in both bell params and mail, falling back to `/en/tasks/<id>`.
  - The due-soon and overdue reminders carry the same link.
- `describe('a task handed to a colleague')`: uses `taskService.assign` with `callerContextAs`. It checks the following.
  - Only the assignee gets a `notifications.staff.task-assigned` bell entry, with no mail.
  - Self-assignment does not notify.
  - The visible portion of the file ends partway through a case about handing the task back to the same colleague, so later cases are not covered here.

## Relationships
- `@infrastructure/adapters/mailer` (`mailer.ts`): mocked; its `enqueueEmail` calls are the main assertion surface.
- `@kernel/registry` and `src/modules.ts`: `registerModules(enabledModules)` wires the real modules so events flow as in production. `enabledModules` is imported by relative path.
- `@kernel/events`: `resetDomainEvents()` isolates tests from each other.
- `@kernel/outbox`: `settleOutboxNudges()` waits for outbox-delivered notices before assertions.
- `@kernel/permissions` and `@kernel/access/tenant`: `callerInScope` and `DEPLOYMENT_TENANT_ID` scope the bell read to the deployment tenant.
- `notifications/services`: `notificationsService` (`listVisible`, `onTaskOpened`, `onTaskDueSoon`, `onTaskOverdue`) is the unit under test.
- `modules/tasks` and `tasks/services`: `taskService` (`create`, `assign`) is the production entry point that triggers alerts.
- `tasks/tests/factories` and `users/tests/factories`: `createSystemTask` and `createUser` provide fixtures.
- `tests/support/callers`, `environment` and the `@tests/response` helpers: `asRole`, `callerContextAs`, `setEnvironment`, `asSuccess` and `asReject`.
- `@types`: supplies `TaskCategory`.

## Notes
- Mail privacy is an explicit invariant. Per-person notices carry only a category and link, while the full visitor message goes only to the support mailbox (`tasks.contact`).
- Only users with an armed authenticator app are told by name. An unarmed support user receives no notice, yet the mailbox is still mailed.
- Contact messages and system tasks notify different sets of people (support and admin versus the task's own route set, e.g. `UserErasure` for moderator).
- Because notices travel through the outbox, tests must settle it before asserting. `fileContact` and `bellOf` already do so.
- `asReject` and `ERROR_CODES` are imported but not used in the visible portion of the file.
