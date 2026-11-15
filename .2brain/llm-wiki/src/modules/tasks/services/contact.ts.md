---
source: src/modules/tasks/services/contact.ts
sha256: 2a5505592cc034ef338d96692b85c644624906d4e50763dbea44b4376249dc14
generated_at: 2026-11-14T22:10:53.582780+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/services/contact.ts

## Purpose

Handles the two user-facing operations for the contact form: creating a contact task (with spam filtering) and mailing the visitor's message to the support mailbox. Both live here so that "a customer asked us something" is a single atomic concern rather than a write the HTTP layer must remember to follow up.

## Key elements

- **`contactDueAt`** *(private)* — Returns the task's due date: one calendar month for `TaskCategory.privacy` (GDPR Art. 12(3)), otherwise `now + NODE_TASKS_CONTACT_SLA_HOURS`.
- **`create(payload, subjectId?)`** *(exported)* — Normalises the email, checks the honeypot (`payload.website`) and `checkEmailPolicy`, then atomically writes the task row and (for non-spam) publishes the `TASK_OPENED` event via `announceInTransaction`. Spam is stored closed with `TaskResolution.spam` and emits no event. Returns the created `TaskDocument`.
- **`mailMainMailbox(taskId, reminder?)`** *(exported)* — Loads the task by id, no-ops if missing or not `TaskKind.contact`, renders the email via `contactRequestEmail`, and enqueues it to `supportEmail()`. For reminders, sets `Message-ID`/`In-Reply-To` to thread under the original mail. Failures are logged, never thrown.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/outbox.ts` | `announceInTransaction` wraps the repository write and the event announcement in one transaction. |
| `src/modules/tasks/events.ts` | Imports the `TASK_OPENED` constant and `taskFactOf` helper to build the event name and payload. |
| `src/modules/tasks/domain/index.ts` | Imports `initialTaskStatus` (spam vs. open) and `CONTACT_ROUTE_SET`. |
| `src/modules/tasks/emails.ts` | Imports `contactRequestEmail` renderer and the `ContactReminder` type. |
| `src/modules/tasks/config.ts` | Reads `tasksConfig().NODE_TASKS_CONTACT_SLA_HOURS` for the non-privacy SLA. |
| `src/domain-primitives/time.ts` | Uses `HOUR_MS` and `oneCalendarMonthLaterUtc` for due-date math. |
| `src/infrastructure/adapters/antibot.ts` | Calls `checkEmailPolicy` for disposable-domain detection. |
| `src/infrastructure/adapters/config.ts` | Reads `supportEmail()` as the recipient address. |
| `src/infrastructure/adapters/mailer.ts` | Calls `enqueueEmail` to dispatch the rendered message. |
| `src/infrastructure/adapters/logger.ts` | Logs email-queue failures (never re-throws). |
| `src/infrastructure/i18n/index.ts` | Calls `getDefaultLocale` for operator-facing mail rendering. |
| `src/infrastructure/persistence/normalize-email.ts` | Normalises the visitor's email before storage and use. |
| `src/infrastructure/persistence/create-repository.ts` | Uses `toObjectId` to convert `subjectId` to a Mongo ObjectId. |

## Notes

- **Honeypot field is never persisted.** `payload.website` exists only in the request contract; a non-empty value flags spam but is dropped before the document is written.
- **Spam is silent by design.** No event is announced and the HTTP response is still `202`, so a bot cannot distinguish "accepted" from "rejected."
- **`replyTo` carries only the bare email address**, never the visitor's free-text `name`, to prevent header injection.
- **Message-ID threading is derived, not stored.** The first mail's id is `<task-<id>@<support-domain>`; a reminder gets `<task-<id>-<reminder>@<domain>` with `In-Reply-To` pointing back. Nothing is persisted for this.
- **`mailMainMailbox` is fire-and-forget.** The task is already committed; a mail-queue failure is an error log, not a rejected promise.
- The `Stryker disable/restore` pair around the catch block suppresses mutation testing for the intentional swallow-and-log path.
