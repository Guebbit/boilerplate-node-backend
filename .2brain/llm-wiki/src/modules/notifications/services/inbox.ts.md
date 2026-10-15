---
source: src/modules/notifications/services/inbox.ts
sha256: ad2dbe87c425edf23d587a4917311c0cc5cf5ceb43ec069b42899837188a7569
generated_at: 2026-10-15T10:51:31.015583+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/services/inbox.ts

## Purpose

The inbox service: the single place where notifications are read, written, and removed (one-at-a-time, all-at-once, or by the per-user cap). Every mutation is fanned out to the owner's open streams so multiple tabs stay in sync. It sits between the HTTP layer (which it wraps in `ResponseSuccess`/`ResponseReject`) and the repository, and delegates presentation to the presenter.

## Key elements

- **`notificationsList(userId)`** – Reads the caller's full inbox, newest first, returned as a `NotificationsView`.
- **`notificationsCreate(rows)`** – Bulk-inserts, publishes a `CREATED` event per row to its owner, then trims each distinct owner's inbox to the configured cap **sequentially** (one after another, not in parallel).
- **`notificationDelete(userId, id)`** – Deletes a single owned notification. Returns 404 for both "not found" and "not yours" to prevent ID probing. Publishes a `DELETED` event with the specific `id`.
- **`notificationsDismissAll(userId)`** – Empties the caller's inbox. Succeeds even if the inbox was already empty. Publishes a `DELETED` event with `all: true`.
- **`notificationsReadAll(userId)`** – Marks every unread notification read as of a single timestamp; publishes a `READ` event carrying that timestamp.
- **`notificationsDeleteByUserId(userId, session)`** – Hard-deletes all notifications for a user. Accepts a Mongoose `ClientSession` so it joins the caller's transaction (used by the `personalData.erase` hook during account deletion).
- **`trimInbox(userId)`** *(module-private)* – Delegates to `notificationRepository.trimToNewest` with the cap from `notificationsConfig()`, then publishes a `DELETED` event for the evicted IDs (only if any were removed).

## Relationships

- **`../repository.ts`** – All persistence (`listByUserId`, `insertMany`, `trimToNewest`, `deleteOwned`, `deleteAllOwned`, `markAllRead`, `deleteByUserId`) goes through `notificationRepository`.
- **`../presenter.ts`** – Shapes raw notifications into `NotificationsView` for the list and into the per-notification payload pushed on `CREATED`.
- **`./stream.ts`** – Every mutation calls `publishToUser` to push a `NOTIFICATIONS_CHANNELS.*` event to the owner's open streams.
- **`../config.ts`** – Reads `notificationsConfig().NODE_NOTIFICATIONS_MAX_PER_USER` for the cap passed to `trimInbox`.
- **`@infrastructure/http/response`** – Wraps outcomes in `generateSuccess` / `generateReject` for the HTTP layer.
- **`@infrastructure/i18n`** – Supplies translated user-facing strings (`notifications.not-found`, `notifications.deleted`, `notifications.dismissed-all`, `notifications.read-all`).
- **`@types`** – Provides the `NOTIFICATIONS_CHANNELS` enum values used as stream event names.
- **`services/index.ts`** – Re-exports the public functions of this module so other code can import from the barrel.

## Notes

- **Sequential trimming:** `notificationsCreate` deliberately awaits `trimInbox` one user at a time. A bulk product delete can target thousands of users; parallelizing would amplify DB load for no correctness gain.
- **Anti-enumeration:** `notificationDelete` intentionally returns the same 404 body whether the ID is unknown or belongs to another user.
- **Idempotent dismiss:** `notificationsDismissAll` does not error on an already-empty inbox—the desired end-state is the same.
- **Transaction coupling:** `notificationsDeleteByUserId` must receive the caller's `ClientSession`; a throw here rolls back the entire account-deletion transaction.
- **`trimInbox` is internal:** It is not exported; external callers should go through `notificationsCreate` (which trims after insert) or the repository directly.
