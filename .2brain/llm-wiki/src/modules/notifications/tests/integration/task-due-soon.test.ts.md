---
source: src/modules/notifications/tests/integration/task-due-soon.test.ts
sha256: 5be57d0e141bde3d1c353993746bb96668ab1701e58fd9eae6c917cab191e7ea
generated_at: 2026-11-08T06:36:07.262818+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/integration/task-due-soon.test.ts

## Purpose

Integration test for the due-soon reminder pipeline. Drives a task whose deadline is two days away through `taskService.remindDueSoon()` and verifies that (1) the right people receive exactly one bell notification and one staff mail, (2) duplicate delivery of the same domain event does not produce duplicates, (3) a privacy-category task additionally mails the support address in-thread, and (4) non-privacy contact categories stay silent.

## Key elements

- **`admin()`** – Creates a fully-authenticated admin user (authenticator enabled) via `createUser`, used as the notification audience.
- **`dueSoonBell(userId)`** – Queries `notificationsService.listVisible` scoped to the deployment tenant and filters items whose `code` is `notifications.staff.task-due-soon`.
- **`dueSoonMails()`** – Reads the mock `enqueueEmail` call log and returns only calls whose template is `notifications.staff-notice` and whose subject starts with "Due soon".
- **`jest.mock('@infrastructure/adapters/mailer')`** – Replaces `enqueueEmail` with a no-op mock so tests can assert on queued envelopes without real mail.
- **`beforeEach`** – Resets the mailer mock, sets `NODE_SUPPORT_EMAIL`, clears domain events, and re-registers modules (fresh kernel state per test).
- **Four `it` blocks** – Cover: basic bell + mail delivery, event-deduplication (calling `onTaskDueSoon` twice), privacy-request special-casing (support mailbox, `inReplyTo` threading, `[privacy]` subject tag), and silence for non-privacy categories.

## Relationships

- **`src/modules/tasks/service.ts`** – Under test; `remindDueSoon()` and `create()` are the entry points that trigger the notification flow.
- **`src/modules/tasks/tests/factories.ts`** – Provides `createSystemTask` and `giveLife` to seed a task with a known deadline offset.
- **`src/modules/notifications/services/index.ts`** – `listVisible` reads back the bell; `onTaskDueSoon` is called directly in the deduplication test to isolate the notification layer.
- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` is mocked; assertions inspect its call log for template, recipient, subject, and `inReplyTo`.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes the outbox so that event-driven work (e.g., notification creation) completes before assertions.
- **`src/kernel/events.ts`** – `resetDomainEvents` ensures no stale domain events leak between tests.
- **`src/kernel/permissions.ts`** – `callerInScope` builds the scoped caller passed to `listVisible`.
- **`src/kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` scopes the caller and the `onTaskDueSoon` fact.
- **`src/kernel/registry.ts` / `src/modules.ts`** – `registerModules(enabledModules)` re-initialises the module graph each test.
- **`tests/support/*`** – `setupTestDb`, `asRole`, `setEnvironment` provide the standard integration-test scaffolding.

## Notes

- The deduplication test calls `notificationsService.onTaskDueSoon` directly rather than going through `taskService.remindDueSoon`, isolating the notification service's own idempotency from the task-service guard.
- Privacy-category tasks use a **different** mail template (`tasks.contact`) than staff notices (`notifications.staff-notice`); the `dueSoonMails()` helper only counts the latter. The privacy test therefore asserts on the `tasks.contact` template explicitly.
- The `inReplyTo` header on the privacy mail (`<task-{id}@example.com>`) ties the reminder to the original contact thread; the test asserts this format.
- Non-privacy categories (e.g. `'order'`) produce **zero** due-soon bell items and **zero** `tasks.contact` mails — the short SLA path is the only channel, and this test confirms no due-soon artefact leaks in.
- `mockEnqueueEmail.mockClear()` is called *after* `settleOutboxNudges` and *before* the `remindDueSoon` call in each test, so only the reminder's own mail is inspected (not any mail fired during task creation/setup).
