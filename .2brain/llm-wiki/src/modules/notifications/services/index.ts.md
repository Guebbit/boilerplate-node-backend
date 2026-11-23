---
source: src/modules/notifications/services/index.ts
source_sha256: c7858ae39b22269a9251828626c91851f0c8ea4060162e616a14e0075ce98180
context_sha256: f763699ccf8d110097ed0ebb7f45bc03c5b2d30579005ff78270bfd3a4041114
generated_at: 2026-11-22T05:55:45.490069+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/services/index.ts

## Purpose
Barrel and public facade for the notifications service. It assembles the functions from the sibling files (`inbox`, `staff`, `stream`, `subscribers`) into a single `notificationsService` object. Controllers and other modules call through this object rather than importing the bare functions.

## Key elements
- **`notificationsService`**: the exported object, grouped by origin:
  - **Inbox** (from `inbox.ts`):
    - `list`
    - `listStaffNotices`
    - `listVisible`
    - `get`
    - `create`
    - `writeSummary`
    - `clearSummary`
    - `remove`
    - `dismissAll`
    - `readAll`
    - `removeByUserId`
  - **Staff** (from `staff.ts`): `notifyStaff`, `staffRecipients`.
  - **Stream** (from `stream.ts`): `stream` (aliases `streamNotifications`), `publishToUser`, `openStreamCount`.
  - **Event subscribers** (from `subscribers.ts`):
    - `onWebhookSubscriptionAutoDisabled`
    - `onTaskOpened`
    - `onTaskOverdue`
    - `onTaskDueSoon`
    - `onTaskAssigned`
    - `onOutboxEventDead`
- **Type re-exports**: `StaffLink`, `StaffRoute` and `StaffNoticeBody` come from `../staff-routing`. `StaffNotice` comes from `./staff`.

## Relationships
- **`src/modules/notifications/services/inbox.ts`, `src/modules/notifications/services/staff.ts`, `src/modules/notifications/services/stream.ts`, `src/modules/notifications/services/subscribers.ts`**: the implementation sources. This file only wires them together and contains no logic of its own.
- **Controllers** (`src/modules/notifications/controllers/delete-notification.ts`, `delete-notifications.ts`, `get-notification.ts`, `get-notifications-stream.ts`, `get-notifications.ts`, `post-read-all.ts`): per the module doc, the controllers go through this service.
- **`src/modules/notifications/staff-routing.ts`**: the source of the re-exported staff routing types.
- **`src/modules/notifications/module.ts` and `src/modules/notifications/index.ts`**: sit in the module's dependency graph alongside this file.
- **Tests** (`src/modules/notifications/tests/contract/api.contract.test.ts`, `src/modules/notifications/tests/integration/service.test.ts`): related via the dependency graph and likely exercise the service.

## Notes
- The convention is to use `notificationsService.*` and avoid importing the bare functions from the sibling files.
- Some names differ from the underlying functions. For example, `get` is `notificationGet`, `remove` is `notificationDelete`, and `stream` is `streamNotifications`.
