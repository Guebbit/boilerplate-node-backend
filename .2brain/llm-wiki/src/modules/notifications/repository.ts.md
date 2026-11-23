---
source: src/modules/notifications/repository.ts
source_sha256: dd1bc426b7b34a7841ebb9356d2874e1f67e0d45cd10bdcea5d2b27814238c29
context_sha256: ab9f19bdc6bdf9f5e4255cb4b08c61e5716c961b031da0fd6716e72ba0bc3dd7
generated_at: 2026-11-22T05:54:59.279353+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/repository.ts

## Purpose
Data-access layer for notifications. It extends the generic repository from `createRepository` with inbox-specific reads and writes. Every method except `deleteSummaries` takes a `userId`, so a row can't be read or removed without naming its owner. Another user's id therefore yields "not found" from the query itself, not from a separate check.

## Key elements
- **`NewNotification`**: caller-supplied fields for a new row (`userId`, `code`, `params`, `severity`).
- **`NewStaffNotification`**: `NewNotification` plus the required `tenantId`, `sets`, `dedupeKey` and `expiresAt`. Writers force `audience: 'staff'` on it.
- **`notificationRepository`**: the exported repository. Its type is written out by hand because Mongoose's inferred generics trigger TS7056. It spreads the standard CRUD from `createRepository(notificationModel, { transform: applyNotificationTransform })` and adds:
  - `listOwn(userId)` and `listStaff(userId, tenantId?)`: newest first, unpaged because each audience is capped. `listStaff` covers every tenant when `tenantId` is omitted (used by the data export).
  - `insertMany(rows)`: one bulk write with `ordered: false`, so a bad row doesn't block the rest.
  - `insertStaffOnce(row)`: inserts a staff notice and returns `null` on a duplicate-key error. The unique `{ userId, dedupeKey }` index settles races between writers. Other errors are rethrown.
  - `findSummary(userId, dedupeKey)` and `writeSummary(row, reappear)`: read and upsert a per-recipient summary row. With `reappear`, `readAt` is unset so the row becomes unread again.
  - `deleteSummaries(dedupeKey)`: removes all recipients' staff summary rows for a code. Returns `{ id, userId }` for each removed row.
  - `findOwned(userId, id)` and `deleteOwned(userId, id)`: owner-scoped lookup and delete. They return `null` or `false` for both a missing row and someone else's row.
  - `deleteByUserId(userId, session?)`: empties a user's inbox, optionally inside a caller's transaction.
  - `deleteByAudience(userId, audience)`: deletes one audience and returns the removed ids.
  - `markAllRead(userId, readAt)`: stamps only rows with no `readAt`.
  - `trimToNewest(userId, keep, audience)`: deletes all but the newest `keep` rows of an audience and returns the removed ids.

## Relationships
- **`src/infrastructure/persistence/create-repository.ts`**: provides `createRepository`, `toObjectId`, and the `Repository` and `Wire` types. These supply the base CRUD and id conversion. Its doc explains why a synchronous throw from `toObjectId` becomes a rejection, which decides between a 4xx and a 500.
- **`src/infrastructure/persistence/mongo-errors.ts`**: `isDuplicateKey` is used by `insertStaffOnce`.
- **`src/modules/notifications/model.ts`**: supplies `notificationModel`, `applyNotificationTransform` and the `NotificationDocument` type.
- **`src/modules/notifications/services/inbox.ts`**: the repository's consumer. The comments mention the service returning the same 404 for missing and foreign rows, and the stream telling open tabs which ids were removed. The file doesn't show the calls themselves.
- **`src/modules/notifications/tests/unit/repository.test.ts`, `src/modules/notifications/tests/integration/service.test.ts`, `src/modules/notifications/tests/factories.ts`**: test and fixture code that exercises the repository.

## Notes
- Methods that return removed ids (`deleteByAudience`, `trimToNewest`, `deleteSummaries`) exist so the stream can tell open tabs which rows left. Each audience (`own`, `staff`) has its own cap, so a flood of staff notices can't evict a user's own messages.
- `deleteSummaries` and `deleteByAudience` do a find followed by a delete. `trimToNewest` uses the same pattern, and its sort has an `_id` tiebreaker for a stable order. `deleteByAudience` and `trimToNewest` delete by the ids they found. `deleteSummaries` re-runs the original filter, so rows added between its two queries are deleted without being reported.
- `markAllRead` and `deleteByUserId` resolve to `void`.
- Besides explicit deletes, rows leave through the cap, the TTL, a cleared summary and account deletion.
- The file's header comment points to the notifications module docs (section "the pipeline") for the wider flow.
