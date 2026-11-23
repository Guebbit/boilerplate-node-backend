---
source: src/modules/notifications/services/subscribers.ts
source_sha256: e440cb7bb828da73c2d2ac20f9d684b6e313d23b200d8b5e1b6d110022fea7eb
context_sha256: fc7c208bc9470070c7480b46356c6c77106f28e3721b8953771473dc6b82b5af
generated_at: 2026-11-22T05:56:35.501890+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/services/subscribers.ts

## Purpose
Maps domain events to the staff inbox notices that every project has: webhook subscription auto-disabled, outbox event dead, and task opened / due soon / overdue / assigned. Each export is one handler that turns an event payload into a notice. The module's `subscribe()` wires them to the bus, and the actual writing is delegated to `./staff`. Project-specific notices (e.g. the shop's) live in their own modules and call `notificationsService.notifyStaff` / `create` directly.

## Key elements
- `onWebhookSubscriptionAutoDisabled` – notifies the staff who manage webhooks, scoped to the event's `tenantId`. Dedupe key: `webhook-disabled:<subscriptionId>:<disabledAt>`.
- `onOutboxEventDead` – notifies administrators under `DEPLOYMENT_TENANT_ID`. Dedupe key: `outbox-dead:<eventId>`.
- `onTaskOpened` – notifies everyone who works the task's kind. For `contact` tasks it then calls `taskService.mailMainMailbox(taskId)`.
- `onTaskOverdue` – same notice flow as `onTaskOpened`. For `contact` tasks it also calls `mailMainMailbox(taskId, 'overdue')`.
- `onTaskDueSoon` – same notice flow. For `contact` tasks it also calls `mailMainMailbox(taskId, 'due-soon')`.
- `onTaskAssigned` – uses `notifyStaffMember` to tell only the new assignee. Its sets are `[routeSet]` and its dedupe key is `task-assigned:<taskId>:<assignedAt>`.
- Private helpers:
  - `notifyTaskStaff(code, dedupePrefix, fact)` builds the shared task notice: body, link, sets, and dedupe key `<prefix>:<taskId>`.
  - `alertSetsOf` picks the permission sets to alert.
  - `taskParametersOf` builds the notice params: `taskId`, `kind`, plus optional `category` and `work`.
  - `CONTACT_ALERT_SET` is `'TaskManagement'`.
  - `TaskAlertCode` is the union of the three task notice codes.

## Relationships
- `./staff` (`src/modules/notifications/services/staff.ts`): provides `notifyStaff` and `notifyStaffMember`, which do the writing.
- `src/modules/notifications/staff-routing.ts`: provides `STAFF_ROUTES` (the route per notice code) and `staffLinkOf` (the link built from the body).
- `src/kernel/events.ts`: provides `DomainEventMap`, which types every handler's payload.
- `src/kernel/permissions.ts`: provides the `PermissionSetName` type, used for `CONTACT_ALERT_SET`.
- `src/kernel/access/tenant.ts`: provides `DEPLOYMENT_TENANT_ID`, used for deployment-wide outbox alerts.
- `src/modules/tasks/index.ts`: provides `taskService`, whose `mailMainMailbox` is called for contact tasks.
- `src/modules/notifications/services/index.ts` and `src/modules/tasks/services/index.ts` are graph neighbors of this file. This file does not import them directly.

## Notes
- For `contact` tasks the alert goes only to `TaskManagement`, not to the wider `TaskDisplay` readers. Other kinds go to `routeSet`.
- For `contact` tasks the route is overridden with `email: 'none'`, so the notice goes to the bell only. Staff are mailed through the main mailbox instead.
- Dedupe keys make delivery idempotent. The outbox delivers at least once, so `onTaskOverdue` relies on its key to avoid duplicate notices.
- `taskParametersOf` is typed on `task.opened` but is also used for `task.overdue` and `task.due_soon` payloads.
- Handlers return `Promise<void>`. The `notifyStaff` count is discarded.
