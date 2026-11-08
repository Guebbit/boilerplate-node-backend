---
source: src/modules/notifications/services/inbox.ts
sha256: 4762db99f5b1a5a3aa65ffa6bd7fc2eb281b51d6f5635188f71f40c3c57eae35
generated_at: 2026-11-08T06:33:13.712127+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/services/inbox.ts

## Purpose

The inbox service: the single place where notifications are read, written, and removed (owner delete, inbox empty, or cap trim). Every mutation is also broadcast to the owner's open streams via `publishToUser`, so multiple tabs stay in sync without a manual refresh.

## Key elements

- **`notificationsList(userId)`** — returns the user's own notifications, newest first, for data export and tests.
- **`notificationsListStaffNotices(userId)`** — returns sanitized staff-notice rows (code, timestamps only; `params` omitted) for the data export.
- **`visibleTo(row, caller)`** *(internal)* — the single visibility gate: own messages always visible; staff notices only to a tenant-scope caller who still holds one of the row's permission sets.
- **`notificationsListVisible(caller)`** — merges own + staff rows, filters through `visibleTo`, sorts descending.
- **`notificationGet(caller, id)`** — fetches one notification; returns 404 for unknown, foreign, or unpermitted rows (anti-enumeration).
- **`trimInbox(userId, audience)`** *(internal)* — deletes everything past the per-audience cap and publishes the removed ids.
- **`notificationsCreate(rows)`** — bulk-inserts, publishes a `CREATED` event per row, then trims each affected user sequentially.
- **`notificationsCreateStaffOnce(row)`** — idempotent insert (dedupe key); returns `true` only when a new row was written, so callers can conditionally send mail.
- **`notificationsWriteSummary(summary, now?)`** — upserts a summary row; returns `'appeared' | 'grew' | 'unchanged'` so digest mailers can skip no-ops. Publishes delete-then-create to keep one copy per tab.
- **`notificationsClearSummary(code)`** — deletes all summary rows for a code (count hit zero) and notifies recipients.
- **`notificationDelete(userId, id)`** — removes one row; 404 if not found or not owned.
- **`notificationsDismissAll(userId, audience?)`** — empties the whole inbox or one audience; publishes `all: true` vs. explicit ids accordingly.
- **`notificationsReadAll(userId)`** — stamps `readAt` on all unread rows and broadcasts a `READ` event.
- **`notificationsDeleteByUserId(userId, session)`** — hard-delete hook for account erasure; joins the caller's mongoose transaction.

## Relationships

- **`src/modules/notifications/repository.ts`** — all reads/writes go through `notificationRepository`; this file never touches Mongoose directly.
- **`src/modules/notifications/services/stream.ts`** — `publishToUser` is called after every mutation (create, delete, read, trim) to push events to open sockets.
- **`src/modules/notifications/presenter.ts`** — `presentNotification` / `presentNotifications` convert DB rows into the API-facing `NotificationsView`.
- **`src/modules/notifications/staff-routing.ts`** — `callerHoldsAnySet` powers the staff-notice visibility check inside `visibleTo`.
- **`src/modules/notifications/config.ts`** — `notificationsConfig()` supplies per-user caps and the staff TTL in days.
- **`src/modules/notifications/model.ts`** — `NotificationDocument` type is the DB row shape used in visibility and trimming logic.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape every API response.
- **`src/infrastructure/i18n/index.ts`** — `t()` localizes the single `notifications.not-found` error string.
- **`src/domain-primitives/time.ts`** — `DAY_MS` is used to compute `expiresAt` in `notificationsWriteSummary`.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — `Caller`, `NOTIFICATIONS_CHANNELS`, `Notification`, `NotificationAudience` types shared across the module.
- **`src/modules/notifications/services/index.ts`** — barrel re-export; consumers import from the barrel, not this file directly.

## Notes

- **Sequential trimming on bulk writes.** `notificationsCreate` trims one user at a time (not `Promise.all`) because a bulk product delete can name thousands of users and parallel cap queries would spike DB load.
- **404 is the only error.** Both `notificationGet` and `notificationDelete` collapse "unknown id", "someone else's", and "lost permission" into the same 404 so a caller cannot enumerate.
- **Summary publish pattern.** `notificationsWriteSummary` emits `DELETED` (old id) before `CREATED` (new row) when a row is updated, ensuring a tab never holds two copies of the same summary.
- **`notificationsDismissAll` stream payload.** Omitting `audience` sends `{ all: true, ids: [] }`; specifying one sends the explicit removed ids so other audiences remain visible in the tab.
- **Transaction coupling.** `notificationsDeleteByUserId` accepts a `ClientSession`; a throw here aborts the surrounding hard-delete transaction.
