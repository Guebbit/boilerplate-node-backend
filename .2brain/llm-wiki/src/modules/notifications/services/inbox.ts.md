---
source: src/modules/notifications/services/inbox.ts
sha256: 2e26a4084a35cb6ed164473e05ca95adda73cdc9bfdd5f078259ca31da6443e8
generated_at: 2026-10-29T04:30:32.780759+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/services/inbox.ts

## Purpose

The inbox service for the notifications module: it writes, reads, and removes a user's own notifications and their tenant's staff (work) notices, enforces per-audience caps, and pushes every change to the owner's open WebSocket streams so multiple tabs stay in sync.

## Key elements

- **`notificationsList`** – Returns a user's own notifications (newest first) as a `NotificationsView`; used by data export and tests.
- **`notificationsListStaffNotices`** – Returns staff-notice metadata (code, timestamps) for data export; deliberately omits `params` because it may name other people's accounts or orders.
- **`notificationsListVisible`** – The primary inbox read: own messages plus staff notices the caller currently holds the permission sets for, merged and sorted newest-first.
- **`notificationGet`** – Fetches one notification by id; returns 404 for unknown, foreign, or no-longer-authorized rows (uniform to prevent probing).
- **`notificationsCreate`** – Bulk-inserts own notifications, pushes each to the owner's streams, then trims each owner to the "own" cap sequentially.
- **`notificationsCreateStaffOnce`** – Inserts a staff notice with a dedupe key; pushes and trims only on a fresh write. Returns `boolean` so the caller can gate a follow-up email.
- **`notificationsWriteSummary`** – Upserts a summary row (keyed by `dedupeKey`). Pushes a DELETED + CREATED pair when the row appears or its count grows; silently updates when the count falls. Returns `SummaryOutcome` (`'appeared' | 'grew' | 'unchanged'`) so the digest service knows whether to send mail.
- **`notificationsClearSummary`** – Deletes all summary rows for a code (e.g. count hit zero) and pushes DELETED events.
- **`notificationDelete`** – Deletes one own notification; 404 if not found or not owned.
- **`notificationsDismissAll`** – Deletes every notification for a user; pushes a single `all: true` DELETED event.
- **`notificationsReadAll`** – Marks all of a user's notifications read with a single timestamp; pushes a READ event.
- **`notificationsDeleteByUserId`** – Hard-deletes for account erasure; accepts a Mongoose `ClientSession` so it joins the caller's transaction (a throw here aborts the delete).
- **Internal: `visibleTo`** – Visibility predicate: own messages always visible; staff notices visible only if the caller is in tenant scope, in the same tenant, and still holds one of the recorded permission sets.
- **Internal: `trimInbox`** – Deletes rows past the newest N for a user + audience, then pushes a DELETED event listing the removed ids.
- **Internal: `countOf`** – Reads the `count` field from a summary row's `params`.

## Relationships

- **`../repository.ts`** – All persistence goes through `notificationRepository`; this file never touches Mongoose models directly.
- **`../presenter.ts`** – Converts `NotificationDocument` rows into `NotificationsView` / `Notification` shapes for API and stream payloads.
- **`./stream.ts`** – Every mutation calls `publishToUser` to push CREATED / DELETED / READ events to the user's open connections.
- **`../staff-routing.ts`** – `callerHoldsAnySet` is used in `visibleTo` to decide whether a staff notice is still visible after a role change.
- **`../config.ts`** – Reads `NODE_NOTIFICATIONS_MAX_PER_USER` and `NODE_NOTIFICATIONS_STAFF_MAX_PER_USER` caps via `notificationsConfig()`.
- **`@infrastructure/http/response`** – Returns `ResponseSuccess` / `ResponseReject` so route handlers can pass them through.
- **`@infrastructure/i18n`** – Uses `t('notifications.not-found')` for the 404 message.
- **`@types`** – Imports `Caller`, `StaffNoticeExport`, `NOTIFICATIONS_CHANNELS`, `Notification`.
- **`../model.ts`** – Imports the `NotificationDocument` type used in internal helpers.
- **`../services/digest.ts`** (upstream caller) – Calls `notificationsWriteSummary` / `notificationsClearSummary` and branches on the returned `SummaryOutcome` to decide whether to send a digest email.
- **`../services/staff.ts`** (upstream caller) – Calls `notificationsCreateStaffOnce` and uses the boolean return to gate a confirmation email.

## Notes

- **Uniform 404:** `notificationGet` and `notificationDelete` return the same 404 for an unknown id, a foreign id, and a staff notice whose permission sets were revoked. This is intentional: a probing caller cannot distinguish the three cases.
- **Sequential trimming:** In `notificationsCreate`, per-user `trimInbox` calls run in a `for…of` loop, not in parallel. A bulk product-delete can name thousands of users; one cap-query per user is already the minimum cost.
- **Delete-then-create for summaries:** `notificationsWriteSummary` pushes a DELETED event for the old row *before* the CREATED event for the new row, so a tab never holds two copies of the same summary.
- **Silent count decrease:** When a summary's count drops, the row is updated in the DB but no stream event is emitted — the comment notes "good news does not need a ping."
- **Transaction safety:** `notificationsDeleteByUserId` takes a `ClientSession` and is documented as the `personalData.erase` hook. A failure inside it aborts the hard-delete transaction.
- **Staff export excludes `params`:** `notificationsListStaffNotices` maps only `code`, `createdAt`, and optional `readAt`. The `params` field is omitted because it may contain other people's account names and order details.
