---
source: src/modules/notifications/tests/integration/task-alerts.test.ts
sha256: 39188f14c3d61ff63d1b7fe43233068aa499c653c6a84b44687abd7fb7759fd9
generated_at: 2026-11-08T06:35:50.318601+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/integration/task-alerts.test.ts

## Purpose

Integration test that verifies the full notification pipeline for task events, driving the system the way production does: real modules registered, tasks created or assigned through `taskService`, and assertions made against both the in-app notification bell and the email queue. It proves three invariants: (1) only staff in the task's work-set see a bell entry, (2) contact messages produce **no** per-person staff-notice mail (only the support mailbox gets the full message), and (3) system tasks produce per-person staff-notice mail but **never** touch the contact mailbox.

## Key elements

- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a `jest.fn()` so tests assert on the queue (envelopes, templates, data) rather than a real SMTP delivery.
- **`staff(role, email, locale?)`** — helper that creates a user via `createUser` with an authenticator app armed, returning a ready-to-act staff member.
- **`bellOf(role, userId)`** — settles the outbox, then calls `notificationsService.listVisible` with a `callerInScope` context to read the user's notification bell.
- **`fileContact(category?)`** — creates a contact task through `taskService.create`, then awaits `settleOutboxNudges` so the notification outbox is flushed before assertions.
- **`noticeMails()` / `mailboxMails()`** — filter `mockEnqueueEmail.mock.calls` by template (`notifications.staff-notice` vs. `tasks.contact`).
- **`handOver()`** — creates a system task and two admin users (giver, taker) for the assignment scenario.
- **Three `describe` blocks** — *"a contact message"*, *"a system task"*, *"a task handed to a colleague"* — each covering bell visibility, email content, idempotency, edge cases (spam, missing category, self-assignment, re-assignment).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/notifications/services/index.ts` | **Primary SUT.** `notificationsService.listVisible`, `.onTaskOpened`, `.onTaskDueSoon`, `.onTaskOverdue` are the methods under test. |
| `src/modules/tasks/index.ts` | `taskService.create` / `.assign` drive the task lifecycle that triggers notifications. |
| `src/infrastructure/adapters/mailer.ts` | Mocked at module level; `enqueueEmail` is the assertion surface for all email claims. |
| `src/kernel/outbox.ts` | `settleOutboxNudges` must be awaited after any task mutation before reading the bell or mail queue. |
| `src/kernel/events.ts` | `resetDomainEvents` clears the in-memory event bus between tests. |
| `src/kernel/registry.ts` + `src/modules.ts` | `registerModules(enabledModules)` wires the real module graph for every test. |
| `src/kernel/permissions.ts` | `callerInScope` builds the scoped caller context used by `listVisible`. |
| `src/kernel/access/tenant.ts` | `DEPLOYMENT_TENANT_ID` scopes every caller and event fact to the deployment tenant. |
| `src/modules/users/tests/factories.ts` | `createUser` fixture for all staff and visitor users. |
| `src/modules/tasks/tests/factories.ts` | `createSystemTask` fixture for the hand-over scenarios. |
| `src/types/index.ts` | `TaskCategory` enum used when filing contacts and in assertions. |
| `tests/support/callers.ts` | `asRole`, `callerContextAs` build raw caller objects for `bellOf` and `taskService.assign`. |
| `tests/support/environment.ts` | `setEnvironment` sets `NODE_SUPPORT_EMAIL` (the support-mailbox address) per test. |

## Notes

- **Outbox timing matters.** Any assertion on the bell or mail queue that follows a task mutation must come after `settleOutboxNudges()`; the `fileContact` helper bakes this in, but direct `notificationsService.onTask*` calls in the system-task and hand-over blocks rely on the service writing synchronously (no outbox hop) — if the implementation changes to use the outbox there, those tests will need the same settle step.
- **Idempotency is explicit.** The *"is told once however often the event is delivered"* test calls `onTaskOpened` twice with identical facts and expects exactly one bell entry; this guards against duplicate event replay.
- **Spam short-circuit.** A task created with a `website` field is treated as spam and must produce **zero** mail and **zero** bell entries — no outbox nudge at all.
- **Template names are the contract.** `notifications.staff-notice` and `tasks.contact` are the two mail templates the test distinguishes; renaming either template silently breaks these filters.
- **Locale-aware links.** The `staff` helper defaults to `en`, but one test creates a support user with `locale: 'it'` to confirm the bell still works across locales; link assertions expect the `/en/` prefix (from the moderator's locale).
