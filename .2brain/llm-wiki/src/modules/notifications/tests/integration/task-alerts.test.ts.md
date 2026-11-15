---
source: src/modules/notifications/tests/integration/task-alerts.test.ts
sha256: c1e97bb0a0359be4d599b25d7861859b136093f616fd711565eecca0bae76805
generated_at: 2026-11-14T20:27:22.689580+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/integration/task-alerts.test.ts

## Purpose

Integration test suite that exercises task-alert notifications the way production drives them: real modules are registered, a contact message or system task is filed through the task service, and the test asserts both the in-app "bell" entries and the queued emails that result. It locks down *who* is notified (only members of the working role-set), *what* each channel carries (staff-notice mails get a category and a link, never the visitor's words; the support mailbox gets the full message), and *when* each channel fires (contact messages → mailbox only; system tasks → bell + per-person mail, never the mailbox).

## Key elements

- **`staff(role, email, locale?)`** – helper that creates a user via `createUser` with `authenticatorEnabledAt` set, simulating a 2FA-armed staff member.
- **`bellOf(role, userId)`** – drains the outbox, then queries the notification service for the given user in the deployment tenant and returns the `items` array.
- **`fileContact(category?)`** – creates a contact-message task through the task service, then awaits `settleOutboxNudges()` so the outbox event has been processed before assertions run.
- **`noticeMails()`** – filters the mocked mailer calls where the template is `notifications.staff-notice`.
- **`mailboxMails()`** – filters the mocked mailer calls where the template is `tasks.contact`.
- **`handOver()`** – creates a system task and two admin users (giver, taker) for the assignment tests.
- **`jest.mock('@infrastructure/adapters/mailer')`** – replaces the mailer with a jest mock so tests inspect the queue rather than sending mail.
- **`describe('a contact message')`** – verifies audience scoping, no per-person mail, full-message mailbox mail with Reply-To, uncategorised label, single mailbox mail even with no armed staff, spam suppression, and idempotent duplicate events.
- **`describe('a system task')`** – verifies audience by route-set, per-person mail (not mailbox), `work`-parameter link propagation into bell, mail, due-soon, and overdue reminders.
- **`describe('a task handed to a colleague')`** – verifies assignee-only bell notification, no mail on re-assigning to self, and re-notification on hand-back.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** – mocked at module scope; the test inspects its call history to assert which emails were queued and with what envelope/data.
- **`src/modules/notifications/services/index.ts`** – the service under test; the file invokes it to trigger notifications (task-opened, due-soon, overdue) and to query the per-user bell list.
- **`src/modules/tasks/index.ts`** – provides the task service used to create contact messages and assign/reassign tasks.
- **`src/modules/tasks/services/index.ts`** – the internal service layer backing the task service; exercised indirectly through the public `taskService` API.
- **`src/modules/tasks/tests/factories.ts`** – `createSystemTask` produces a system-task fixture for the assignment and system-task suites.
- **`src/modules/users/tests/factories.ts`** – `createUser` builds every user fixture.
- **`src/kernel/registry.ts`** – `registerModules` wires the real modules before each test so events flow through the full pipeline.
- **`src/modules.ts`** – supplies the `enabledModules` array passed to the registry.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes the outbox so notifications are created before assertions run.
- **`src/kernel/events.ts`** – `resetDomainEvents` clears the event bus between tests.
- **`src/kernel/permissions.ts`** – `callerInScope` builds the scoped caller identity used when querying the bell.
- **`src/kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` identifies the tenant context for all service calls.
- **`src/types/index.ts`** – `TaskCategory` enum used to tag contact messages.
- **`tests/support/callers.ts`** – `asRole` and `callerContextAs` build caller identities for service invocations.
- **`tests/support/environment.ts`** – `setEnvironment` sets `NODE_SUPPORT_EMAIL` which becomes the mailbox recipient.

## Notes

- The mailer mock is hoisted to module scope; `mockReset()` in `beforeEach` means assertions always see only the calls from the current test.
- `settleOutboxNudges()` is an async drain — forgetting to await it (as `fileContact` does) will cause "bell is empty" false negatives.
- Contact messages intentionally produce **zero** staff-notice mails; the full visitor message goes only to the contact mailbox. This is a deliberate privacy boundary the tests guard.
- System tasks produce per-person staff-notice mails (with a `link` derived from the `work` parameter or a default path) and **never** the contact mailbox.
- The `staff()` helper sets `authenticatorEnabledAt`; without it the user is treated as "unarmed" and excluded from per-person notification (tested explicitly in the "nobody can be told by name" case).
- Duplicate delivery idempotency is verified by calling the notification handler twice with the same fact and asserting the bell has exactly one entry.
