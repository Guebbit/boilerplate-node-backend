---
source: src/modules/notifications/module.ts
source_sha256: 54e0c3a46aa95af2a6a485729406083a3295dc4b68f4e523d8881b3bf1ac2e94
context_sha256: 3fd249bf0224beeafba54a5c2b297e6ec524de54a3a628b53b54945d71bd76f5
generated_at: 2026-11-22T05:54:09.088892+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/module.ts

## Purpose
Manifest entry for the notifications module, which is the per-user notifications inbox. It also carries staff work notices (`audience: staff`). The file wires the module's routes, config slice, personal-data handlers, domain-event subscriptions, locales and templates into the app. Domain events write the inbox, so event producers don't need to know about it.

## Key elements
- **Default export** is an object that `satisfies AppModule`. It has these fields:
  - `name: 'notifications'`.
  - `mounts`: mounts the `router` from `./routes` at `/notifications`.
  - `config`: contributes `notificationsConfig.slice`.
  - `personalData`: has two sections.
    - `notifications`: `collect` returns the items from `notificationsService.list(userId)`. `erase` calls `notificationsService.removeByUserId(userId, session)` and joins the caller's hard-delete transaction.
    - `staffNotifications`: `collect` calls `notificationsService.listStaffNotices(userId)`. It has no `erase`, because the rows are the same as the first section's and are erased with it.
  - `subscribe()`: registers `onDomainEvent` handlers (listed below).
  - `locales` and `templates`: the `locales` and `templates` directories next to the file, resolved with `__dirname`.

Event subscriptions, all handled by `notificationsService`:

| Event | Handler |
|---|---|
| `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` | `onWebhookSubscriptionAutoDisabled` |
| `OUTBOX_EVENT_DEAD` | `onOutboxEventDead` |
| `TASK_OPENED` | `onTaskOpened` |
| `TASK_OVERDUE` | `onTaskOverdue` |
| `TASK_DUE_SOON` | `onTaskDueSoon` |
| `TASK_ASSIGNED` | `onTaskAssigned` |

## Relationships
- `src/kernel/registry.ts`: supplies the `AppModule` type that the manifest must satisfy. `src/modules.ts` is the module list and is presumably where this manifest is registered.
- `src/kernel/events.ts`: supplies `onDomainEvent`, used in `subscribe`.
- `src/kernel/outbox.ts`: supplies the `OUTBOX_EVENT_DEAD` event name.
- `src/modules/tasks/index.ts` and `src/modules/webhooks/index.ts`: supply the task and webhook event names. The module imports only these names, not the producers' internals. `src/modules/tasks/module.ts` and `src/modules/webhooks/module.ts` are the sibling modules' own manifests.
- `./config`, `./routes` and `./services`: provide `notificationsConfig`, `router` and `notificationsService`. The service holds all the handler and data logic.
- `tests/integration/erasure.test.ts`: tests the erasure behaviour wired through `personalData`.

## Notes
- A sibling module that writes a notice itself calls `notificationsService` directly instead of emitting an event. The shop module's notices are written this way, with the shop's own routing.
- `./staff-routing` decides who hears the notices every project has. `access` and `users` decide who that is today. The file's doc comment describes this, but the staff routing code is not imported here.
- Per the doc comment, rows are kept until the owner deletes them, the per-user cap pushes them out, or the account is deleted.
