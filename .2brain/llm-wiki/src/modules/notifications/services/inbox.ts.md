---
source: src/modules/notifications/services/inbox.ts
source_sha256: 4e0f6fd75b59a293a29cebd7d856b69c39b1117d6e94e4631a4fab94f019ca5e
context_sha256: 0554c37f3b4e0be7c4fa71d9cf751e9ff75d23c59904c143714eb01d14035119
generated_at: 2026-11-22T05:55:33.665509+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/services/inbox.ts

## Purpose
The notifications inbox service: it writes, reads and removes notifications, and pushes every change to the owner's open streams so multiple tabs stay in sync. It covers creation, listing, per-user caps, summary rows, deletion, mark-all-read, and erasure on account deletion.

## Key elements
- `notificationsList(userId)`: the user's own messages, newest first (used by the data export and tests).
- `notificationsListStaffNotices(userId)`: work notices as the data export shows them. It returns only `code`, `createdAt` and optional `readAt`, never `params`.
- `notificationsListVisible(caller)`: the caller's own messages plus the staff notices of their tenant, filtered by `visibleTo` and sorted newest first.
- `notificationGet(caller, id)`: returns one notification, or a 404 reject. The 404 is the same for an unknown id, someone else's notification, or a staff notice the caller no longer holds the sets for.
- `notificationsCreate(rows)`: inserts rows, publishes `CREATED` for each, then trims each distinct owner sequentially to the `own` cap.
- `notificationsCreateStaffOnce(row)`: an idempotent insert of a staff notice. It publishes and trims only if the notice was newly written, and returns a boolean so the caller mails only on the first write.
- `notificationsWriteSummary(summary, now)`: upserts a per-recipient summary row and returns a `SummaryOutcome` (`'appeared' | 'grew' | 'unchanged'`).
  - The expiry is computed as `NODE_NOTIFICATIONS_STAFF_TTL_DAYS` × `DAY_MS` from `now`.
  - When the row appeared or grew, it publishes a `DELETED` event for the old row's id (if one existed), then a `CREATED` event, then trims.
  - When the count is unchanged or lower, it updates quietly, with no event and no trim.
- `notificationsClearSummary(code)`: deletes all recipients' summary rows for a code and publishes `DELETED` per user.
- `notificationDelete(userId, id)`: deletes one owned notification, with a 404 if none matched, and publishes `DELETED`.
- `notificationsDismissAll(userId, audience?)`: empties the whole inbox or one audience. A whole-inbox delete publishes `{ all: true }`. An audience delete publishes only the deleted ids.
- `notificationsReadAll(userId)`: marks all notifications read as of now and publishes `READ` with an ISO `readAt`.
- `notificationsDeleteByUserId(userId, session)`: the `personalData.erase` hook. It runs inside the caller's hard-delete transaction.
- `SummaryOutcome`: the exported outcome type.
- Internal helpers:
  - `visibleTo`: the visibility rule.
  - `trimInbox`: cap enforcement.
  - `countOf`: reads `params.count`, defaulting to 0.

## Relationships
- `../repository`: all persistence goes through `notificationRepository` (`listOwn`, `listStaff`, `findOwned`, `insertMany`, `insertStaffOnce`, `trimToNewest`, `findSummary`, `writeSummary`, `deleteSummaries`, `deleteOwned`, `deleteByUserId`, `deleteByAudience`, `markAllRead`). It also supplies the `NewNotification` and `NewStaffNotification` types.
- `./stream`: `publishToUser` pushes `CREATED`, `DELETED` and `READ` events on `NOTIFICATIONS_CHANNELS` (from `@types`).
- `../presenter`: `presentNotification` and `presentNotifications` shape documents for output.
- `../config`: `notificationsConfig()` supplies `NODE_NOTIFICATIONS_MAX_PER_USER`, `NODE_NOTIFICATIONS_STAFF_MAX_PER_USER` and `NODE_NOTIFICATIONS_STAFF_TTL_DAYS`.
- `../staff-routing`: `callerHoldsAnySet` decides whether a caller may see a staff notice.
- `../model`: `NotificationDocument` is used as a type.
- `@infrastructure/http/response`: `generateSuccess` and `generateReject` build the responses.
- `@infrastructure/i18n`: `t` provides the 404 message for not-found notifications.
- `@domain-primitives/time`: `DAY_MS` is used for the summary expiry.
- `@types`: `Caller`, `Notification`, `NotificationAudience`, `StaffNoticeExport` and `NOTIFICATIONS_CHANNELS`.

## Notes
- Staff notices are filtered at read time by the caller's current permission sets. Revoking a role hides the notices without any write.
- The `own` and `staff` audiences have separate caps, and trimming runs after the insert.
- Trimming is sequential per owner on purpose, because bulk events can name thousands of users.
- A filtered dismiss publishes ids rather than `all: true`, so the owner's other tab isn't wiped.
- Summary rows that grow are republished as a delete followed by a create, so a tab holds one copy.
- `notificationsDeleteByUserId` must throw rather than swallow errors, so the surrounding transaction aborts.
- `notificationsListVisible` expects `caller.id` to be set. Outside tenant scope it returns only the caller's own messages.
