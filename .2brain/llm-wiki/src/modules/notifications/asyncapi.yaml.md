---
source: src/modules/notifications/asyncapi.yaml
source_sha256: 92001e4fd489630295752bf9a518d37124d7198c7d2e0761384bbbf83f1bf749
context_sha256: 22aa8c7522a7602921a7582e58efac64d0f3b3e8dd2f48727a8d474c604cd6c4
generated_at: 2026-11-22T05:52:27.801194+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/asyncapi.yaml

## Purpose
The notifications module's AsyncAPI 3.0.0 contract for the per-user SSE stream served at `/notifications/stream`. It is a complete, standalone document (lintable via `npm run lint:asyncapi:modules`), mirroring how `./openapi.yaml` is a complete OpenAPI document. The bundler merges its channels, operations and components into the repo-root contracts. A frame reaches only the connections of the user it concerns.

## Key elements
- **Server `sseNotificationsLocal`**: `localhost:3000`, protocol `http`. Declared locally rather than shared with the observability module, because the bundler gives a server to exactly one section and a document without a server does not lint on its own.
- **Channels** (all `x-transport: sse`, all on `sseNotificationsLocal`):
  - `notifications.created`: a notification was written for the connected user.
  - `notifications.deleted`: one or more of the user's notifications are gone.
  - `notifications.read`: the user's notifications were marked read.
- **Operations** (all `action: send`):
  - `sseNotificationCreated`: pushes the whole notification so clients add it without a refetch. If the per-user cap trims the oldest, a `notifications.deleted` frame follows right after.
  - `sseNotificationsDeleted`: sent on `DELETE /notifications/{id}`, `DELETE /notifications`, or cap trimming. `all` is true when the whole inbox went. A filtered delete (`DELETE /notifications?audience=`) sends `all: false` plus the removed ids.
  - `sseNotificationsRead`: sent when `POST /notifications/read-all` runs, so the badge clears in every open tab.
- **Messages**: `NotificationCreatedEvent`, `NotificationsDeletedEvent`, `NotificationsReadEvent`, each pointing at a payload schema (`NotificationCreatedPayload`, `NotificationsDeletedPayload`, `NotificationsReadPayload`).
- **Schemas**: payloads mirroring the `Notification` union variant for variant. Each variant is an object with required `id`, `audience` (`own` | `staff`), `code`, `params`, `severity` (`info` | `success` | `warning` | `error`) and `createdAt`. `readAt` is optional and absent while unread. `additionalProperties: false` throughout. Visible variants:
  - `NotificationStaffWebhookDisabledPayload` (code `notifications.staff.webhook-disabled`, params `WebhookDisabledParamsPayload` with `subscriptionId`).
  - `NotificationStaffTaskOpenedPayload`, `NotificationStaffTaskOverduePayload` and `NotificationStaffTaskDueSoonPayload` (codes `notifications.staff.task-opened`, `.task-overdue` and `.task-due-soon`), all using `TaskOpenedParamsPayload` (`taskId`, `kind`, optional `category`, optional `work`).
  - `NotificationStaffTaskAssignedPayload` (uses `TaskAssignedParamsPayload`: `taskId`, `kind`).

## Relationships
- **`src/modules/notifications/openapi.yaml`**: the REST sibling. The `Notification` schema there is deliberately repeated here rather than `$ref`'d, and the producer is typed against both. The REST endpoints named in the operation descriptions (delete, delete-all, filtered delete, read-all) are what trigger these SSE frames.

## Notes
- Payload schemas are intentionally duplicated from `openapi.yaml`; keep the two in sync by hand.
- The `x-transport: sse` marker on each channel is read by `scripts/contracts/generate-asyncapi-types.ts` to pick the SSE channels.
- Member schemas are listed before the union that names them, because the generated Zod schemas are `const`s.
- Modules that add notices append their payloads via an `x-extends` fragment.
- A filtered delete also removes staff rows the caller no longer sees, so a `deleted` frame may name ids the tab never held.
