---
source: src/modules/notifications/model.ts
source_sha256: d7661e92d07116f09fcfc4a3325739e901681cac73124377909f0f989f256606
context_sha256: 676e81ea29aa370740f7e51c8743f3275b721183a629dd3f11482681e219baef
generated_at: 2026-11-22T05:53:54.155865+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/model.ts

## Purpose
Defines the Mongoose model and TypeScript types for persisted notifications. A notification is one row per message per user, storing a `code` and its `params` rather than any translated text, so the frontend translates from its own locale files and stored rows survive a language change.

## Key elements
- `NotificationCode`: the `code` of each variant of the contract's `Notification` type.
- `NotificationParametersByCode`: maps each code to the `params` type its contract variant declares.
- `NotificationBody`: a union with one `{ code, params }` member per code, so narrowing on `code` also narrows `params`.
- `NotificationDocument`: the common fields (`userId`, `severity`, `audience`, `readAt`, `createdAt`) plus a `NotificationBody`. The staff-only optional fields are `tenantId`, `sets`, `dedupeKey` and `expiresAt`.
- `NotificationModel`: `Model<NotificationDocument>`.
- `notificationSchema`: the Mongoose schema.
  - `code` is a free `String` (an open set).
  - `params` is `Mixed`, defaulting to `{}`.
  - `audience` defaults to `'own'`.
  - Timestamps are `createdAt` only.
- Indexes:
  - `{ userId: 1, createdAt: -1 }` serves the inbox read (newest first) and the cap's trim from the far end.
  - A unique partial index on `{ userId, dedupeKey }`, applied only where `dedupeKey` is a string, gives one work notice per situation per recipient.
  - A TTL index on `expiresAt` with `expireAfterSeconds: 0`.
- `applyNotificationTransform`: built with `applySerialization(notificationSchema)`. It maps `_id` to `id` and drops `__v`.
- `notificationModel`: the registered `'Notification'` model.

## Relationships
- Imports `NotificationAudience`, `NotificationSeverity` and the `Notification` contract type from `@types` (`src/types/index.ts`).
- Imports `applySerialization` from `src/infrastructure/persistence/serialize.ts`.
- Per its comments, queries live in `./repository` and rules live in `./services`. The repository factory relies on `applyNotificationTransform` for its lean reads.
- The comments name `writeSummary` as the writer that rewrites a summary row's count in place.

## Notes
- `params` is `Mixed`, so the database does not check that it matches `code`. The type safety is a promise kept by the writers, which build `NewNotification` from the same union.
- `code` is not restricted by an enum. The module that writes a code owns it.
- The `notificationSchema` type is written out explicitly because the inferred type exceeds what TypeScript can serialize (TS7056).
- `tenantId`, `sets`, `dedupeKey` and `expiresAt` are used on staff rows only.
  - `sets` is checked at read time and never sent on the wire.
  - Reads filter staff rows by the caller's shop.
  - The partial unique index exists so that a person's own messages, which have no `dedupeKey`, never collide on it.
- `updatedAt` is disabled. The only later changes to a row are `readAt` and a summary row's count.
