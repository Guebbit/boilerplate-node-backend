---
source: src/modules/notifications/repository.ts
sha256: bbfd7260ed3113c5bf897bffd0175f1a3953652f5a849b4e0905f3a9ac5515cc
generated_at: 2026-11-08T06:32:42.753288+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/repository.ts

## Purpose

The data-access layer for notifications. It extends the shared `createRepository` CRUD factory with the specific read/write operations an inbox service needs (list, insert, dedup-aware upserts, per-audience trims, bulk deletes). Every query is scoped by `userId` in the Mongo filter itself, so cross-user access is structurally impossible rather than guarded by a separate check.

## Key elements

- **`NewNotification`** — the caller-supplied subset of fields for a new own-audience row (`userId`, `code`, `params`, `severity`).
- **`NewStaffNotification`** — extends `NewNotification` with the required staff fields (`tenantId`, `sets`, `dedupeKey`, `expiresAt`); `audience` is always `'staff'`.
- **`notificationRepository`** — the exported singleton. Standard CRUD comes from `createRepository(...)`; the file then layers on:
  - `listOwn` / `listStaff` — bounded, un-paged lists (own vs. staff audience; optional `tenantId` filter for staff).
  - `insertMany` — unordered bulk insert (one query for bulk product-delete fan-out).
  - `insertStaffOnce` — insert-or-skip via the unique `{userId, dedupeKey}` index; returns `null` on duplicate so the caller skips re-push/re-mail.
  - `findSummary` / `writeSummary` — look up or upsert a per-`(userId, dedupeKey)` summary; `reappear` flag optionally clears `readAt`.
  - `deleteSummaries` — removes every row for a `dedupeKey` and returns the affected `{id, userId}` pairs.
  - `findOwned` / `deleteOwned` — single-row access gated by `_id` **and** `userId`.
  - `deleteByUserId` — full inbox wipe (hard-delete / "clear all"); accepts an optional Mongoose `ClientSession` for transactional use.
  - `deleteByAudience` — removes one audience's rows and returns the deleted ids so an open UI tab can sync.
  - `markAllRead` — stamps `readAt` on still-unread rows only.
  - `trimToNewest` — enforces the per-audience cap; deletes rows beyond the newest `keep` and returns their ids.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides `createRepository`, `toObjectId`, and the `Repository`/`Wire` types that this file composes and extends.
- **`src/infrastructure/persistence/mongo-errors.ts`** — provides `isDuplicateKey`, used by `insertStaffOnce` to distinguish a safe repeat from a real error.
- **`src/modules/notifications/model.ts`** — provides `notificationModel` (the Mongoose model), `applyNotificationTransform` (passed to the factory), and the `NotificationDocument` type.
- **`src/modules/notifications/services/inbox.ts`** — the service layer that calls every method on `notificationRepository`; it interprets `null`/`false` returns as 404 vs. dedup-skip.
- **`src/modules/notifications/tests/factories.ts`** — builds `NewNotification` / `NewStaffNotification` fixtures for tests.
- **`src/modules/notifications/tests/integration/service.test.ts`** — integration tests that exercise the repository through the inbox service.

## Notes

- `toObjectId` throws on a malformed id; the file's JSDoc notes this is intentional so a bad id yields a 4xx (caught upstream) rather than a 500.
- The explicit type annotation on `notificationRepository` exists because TypeScript's TS7056 prevents inferring Mongoose generics across an export boundary.
- `insertMany` uses `ordered: false` deliberately: one bad row should not abort the remaining rows in a bulk fan-out.
- `deleteByAudience` and `trimToNewest` both do a find-then-delete pattern (two round-trips) so they can return the exact ids removed for UI reconciliation.
- Per-audience caps are enforced by `trimToNewest`, not by a single global limit, so a staff-notice flood cannot evict a user's own messages.
