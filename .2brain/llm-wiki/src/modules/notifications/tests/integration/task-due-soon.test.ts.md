---
source: src/modules/notifications/tests/integration/task-due-soon.test.ts
source_sha256: 2a6b0f666526a08c70b3bab1ad7dd971f7f95c5caccc6c1d49369b7799e1ce9c
context_sha256: aec6a31428a66faa9ccced3f3fb33703468a228aeef40dd90359f76a02f22026
generated_at: 2026-11-22T05:58:26.993610+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/tests/integration/task-due-soon.test.ts

## Purpose
Integration test for the due-soon reminder, driven as production drives it: a task whose deadline is two days away, then the tasks sweep (`taskService.remindDueSoon`). It verifies that staff admins are told once, by bell notification and by mail, and that privacy-category contact requests are additionally mailed to the support mailbox while other contact categories are not.

## Key elements
- `jest.mock('@infrastructure/adapters/mailer', ...)` replaces `enqueueEmail` with a mock, so tests assert on queued mail rather than on its copy. It is exposed as `mockEnqueueEmail`.
- `setupTestDb()` sets up the test database.
- `beforeEach` / `afterEach`: reset the mock, set `NODE_SUPPORT_EMAIL` to `desk@example.com`, call `resetDomainEvents()`, and call `registerModules(enabledModules)`. `afterEach` resets domain events again.
- `admin()` creates an admin user with an authenticator enabled (`authenticatorEnabledAt`), i.e. one who "can act".
- `dueSoonBell(userId)` lists the user's visible notifications via `notificationsService.listVisible`, using a tenant-scoped admin caller in `DEPLOYMENT_TENANT_ID`. It filters to code `notifications.staff.task-due-soon`.
- `dueSoonMails()` filters the enqueued mails to template `notifications.staff-notice` whose subject starts with `Due soon`.
- Test cases:
  - **Once by bell and mail:** a system task given a deadline via `giveLife(id, 2, 10)`. Running `remindDueSoon` twice yields one bell item (`audience: 'staff'`, `kind: 'export_failed'`) and one mail to `admin@example.com`.
  - **Duplicate event delivery:** calling `notificationsService.onTaskDueSoon` twice with the same fact yields one bell item and one mail.
  - **Privacy request:** a `privacy` category task created via `taskService.create` and given life with `giveLife(id, 2, 30)` yields one bell item and exactly one `tasks.contact` mail. That mail goes to `desk@example.com`, has a subject containing `Contact request due soon` and `[privacy]`, and an `inReplyTo` of `<task-{id}@example.com>`.
  - **Ordinary contact message:** an `order` category task yields no bell item and no `tasks.contact` mail, because it only has its short SLA.

## Relationships
- Calls `taskService` (`src/modules/tasks`) for `create` and `remindDueSoon`, and `notificationsService` (`src/modules/notifications/services`) for `listVisible` and `onTaskDueSoon`.
- Uses the factories `createSystemTask` and `giveLife` (`tasks/tests/factories`) and `createUser` (`users/tests/factories`).
- Uses the test support helpers `setupTestDb`, `asRole` and `setEnvironment` (`tests/support/*`).
- Mocks `enqueueEmail` from `src/infrastructure/adapters/mailer.ts`.
- Uses kernel pieces:
  - `DEPLOYMENT_TENANT_ID` (`kernel/access/tenant`)
  - `callerInScope` (`kernel/permissions`)
  - `settleOutboxNudges` (`kernel/outbox`), which waits for outbox-driven work to finish
  - `resetDomainEvents` (`kernel/events`)
  - `registerModules` (`kernel/registry`), called with `enabledModules` from `src/modules.ts`

## Notes
- Each test calls `settleOutboxNudges()` after actions and `mockEnqueueEmail.mockClear()` after setup, so only mail from the sweep is counted.
- The `describe` title says "three days from its deadline", while the file header and `giveLife(..., 2, ...)` refer to a deadline two days away. The test code itself does not explain this difference.
- Domain events are reset and modules re-registered for every test, so subscriptions do not leak between cases.
