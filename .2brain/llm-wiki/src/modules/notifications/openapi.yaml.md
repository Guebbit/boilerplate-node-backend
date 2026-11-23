---
source: src/modules/notifications/openapi.yaml
source_sha256: 1f2c08d5604d89a24b4a02b29c0647e4d8b0b0f58e5e5c3f33595669c6358207
context_sha256: e0f8d4768fc28b1df25182cb190614b965c1898810925be1b57cc7c9635f0b7b
generated_at: 2026-11-22T05:54:26.954457+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/openapi.yaml

## Purpose
OpenAPI 3.1 contract for the notifications module: the signed-in user's in-app notifications (their own, plus shop "work notices" for staff). It defines the HTTP paths, the module's schemas, and the module's section of the account data export.

## Key elements
- **Tag `Notifications`** (`x-family: Core`): all operations file under it.
- **`x-personal-data`**: this module's section of `POST /account/export`, which the bundler adds to `AccountExportResponse`.
  - `notifications`: an array of `Notification`, the whole inbox, read and unread. It is empty, never absent.
  - `staffNotifications`: an array of `StaffNoticeExport`. It holds when and which kind of notice, never `params`, because those name other people's orders and accounts.
- **Paths:**
  - `GET /notifications` (`listNotifications`): the caller's inbox, newest first. It also includes `audience: staff` notices for permission sets the caller holds right now. It is never paginated, because the per-user cap bounds the inbox, and it never answers 404.
  - `DELETE /notifications` (`dismissAllNotifications`): hard-deletes all of the caller's notifications. The optional `audience` query narrows it to one group. It returns 204 even when nothing was there.
  - `GET /notifications/stream` (`getNotificationsStream`): a Server-Sent Events stream (`text/event-stream`) of created, deleted and read events.
  - `POST /notifications/read-all` (`readAllNotifications`): sets `readAt` on every unread notification. It is idempotent and returns 204.
  - `GET /notifications/{id}` (`getNotificationById`): fetches one of the caller's own notifications.
  - `DELETE /notifications/{id}` (`deleteNotificationById`): permanently deletes one of the caller's own notifications.
- **Schemas (visible portion):**
  - `NotificationSeverity`: `info`, `success`, `warning` or `error`. It describes meaning, not look.
  - `NotificationAudience`: `own` or `staff`.
  - `WebhookDisabledParams`: `subscriptionId`.
  - `TaskOpenedParams`: `taskId`, `kind`, optional `category`, and optional `work`, an opaque staff-screen path.
  - `TaskAssignedParams`: the start of another params variant.
  - `Notification`: one variant per `code`, each with its own typed `params`.

## Relationships
- `asyncapi.yaml` (same directory) documents the events of the live stream. This file's `/notifications/stream` operation points to it for the channels and their payloads.

## Notes
- The backend stores a `code` and `params`, never text. The frontend translates `code` from its own locale files, so a client switches on `code` to get the right `params` shape.
- Responses, the `IdPathParam` parameter and the `Id` schema are `$ref`'d from a shared root contract rather than defined here. The `ReauthRequest` pattern in the account module's contract is cited as the model for the per-`code` typed `params`.
- `/notifications/stream` must be mounted above `/{id}` in the router. Express matches in mount order, so the literal segments (`stream`, `read-all`) must not be read as an id.
- The stream uses `cookieAuth` (the HttpOnly refresh cookie), because an `EventSource` cannot set an `Authorization` header. All other operations use `bearerAuth`.
- Staff notices are visible only while the caller holds the required permission sets. A member who loses a role stops seeing them, and a member promoted later sees only those written after.
- A notification belonging to someone else returns the same 404 on get and delete as an unknown or malformed id, so a probe cannot tell them apart.
- `DELETE /notifications` is a hard delete of membership, while `read-all` is an action that only moves `readAt`.
- The stream carries only what is written while it is open. A client should call `GET /notifications` first, on login, reload or reconnect.
- Cross-copy fan-out of stream events uses Redis pub/sub.
