---
source: src/modules/notifications/repository.ts
sha256: 0306bc12d631a07744cebc3b196ef2bff5b8d4f83103f93a3626f7e0b1baa94b
generated_at: 2026-10-29T04:29:42.046675+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/repository.ts

## Purpose

Domain-specific repository for the notifications collection. Extends the standard CRUD factory with every write and read an inbox actually performs, all keyed by `userId` so ownership isolation is a property of the query itself rather than a check a caller must remember.

## Key elements

- **`NewNotification`** (type) — the subset of `NotificationDocument` a caller supplies to create a row (`userId`, `code`, `params`, `severity`).
- **`NewStaffNotification`** (type) — extends `NewNotification` with required staff fields (`tenantId`, `sets`, `dedupeKey`, `expiresAt`). Always written as `audience: 'staff'`.
- **`notificationRepository`** (const) — the sole runtime export. Spreads `createRepository(notificationModel, { transform: applyNotificationTransform })` and adds:
  - `listOwn(userId)` — user's `own`-audience rows, newest first, cap-bounded.
  - `listStaff(userId, tenantId?)` — `staff`-audience rows; `tenantId` narrows to one shop, omitted means all (data export).
  - `insertMany(rows)` — bulk insert with `ordered: false` so one bad row doesn't abandon the batch.
  - `insertStaffOnce(row)` — idempotent staff insert; returns `null` on duplicate-key (the unique `{userId, dedupeKey}` index is the arbiter).
  - `findSummary(userId, dedupeKey)` — look up a recipient's summary row.
  - `writeSummary(row, reappear)` — upsert a summary row; `reappear` unsets `readAt` so an unchanged count doesn't re-nag.
  - `deleteSummaries(dedupeKey)` — removes all recipients' rows for a code; returns the affected `{id, userId}` pairs.
  - `findOwned(userId, id)` / `deleteOwned(userId, id)` — single-row get/delete scoped to the caller; `null`/`false` covers both "missing" and "someone else's."
  - `deleteByUserId(userId, session?)` — empty a user's inbox; accepts an optional Mongoose `ClientSession` for transactional use.
  - `markAllRead(userId, readAt)` — stamps still-unread rows, preserving original `readAt` on already-read ones.
  - `trimToNewest(userId, keep, audience)` — enforces the per-audience cap; returns the ids it removed so a live stream tab can reconcile.

## Relationships

- **`@infrastructure/persistence/create-repository`** — provides the base CRUD (`createRepository`, `Repository`, `Wire`) and the `toObjectId` guard used in every filter.
- **`@infrastructure/persistence/mongo-errors`** — `isDuplicateKey` is checked inside `insertStaffOnce` to distinguish a dedupe hit from a real error.
- **`./model`** — supplies `notificationModel` (the Mongoose model), `applyNotificationTransform` (the row serializer), and the `NotificationDocument` type.
- **`./services/inbox`** and **`./services/subscribers`** — primary consumers; inbox calls the own-audience methods, subscribers call the staff/summary methods.
- **`./tests/factories`** and **`./tests/integration/service.test.ts`** — exercise this repository in integration tests.

## Notes

- The return type is written out explicitly because Mongoose generics are too large for TypeScript to infer at an export boundary (TS7056).
- Every method is `async` because `toObjectId` throws on a malformed id; that is what turns a bad caller input into a 4xx instead of a 500.
- `deleteSummaries` and `trimToNewest` each perform a find-then-delete (two round trips) specifically to return the removed ids to the caller.
- Staff writes always set `audience: 'staff'` inline in the mutation; the type makes it `Required` so a caller cannot omit it.
- `insertMany` uses `ordered: false` — a single invalid row is skipped, the rest still land. This matters for bulk product-deletes that fan out one row per affected user.
