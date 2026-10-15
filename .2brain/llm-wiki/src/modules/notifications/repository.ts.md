---
source: src/modules/notifications/repository.ts
sha256: fa73785333ebaf4922a4a159b37f3e9d55a754c7c3ad6b22434b6975cb5aa006
generated_at: 2026-10-15T10:51:06.130225+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/repository.ts

## Purpose

Repository for the `notifications` collection. Extends the shared `createRepository` CRUD factory with the inbox-specific writes a caller actually performs (bulk insert, targeted delete, mark-read, cap-trim). Every operation is scoped by `userId` in the query itself, so cross-user access is structurally impossible rather than enforced by an application-level check.

## Key elements

- **`NewNotification`** — input type for inserts; picks `userId`, `code`, `params`, `severity` from the document shape.
- **`notificationRepository`** — the single exported const. Spreads `createRepository(notificationModel, { transform: applyNotificationTransform })` (giving `findById`, `create`, `updateById`, `deleteById`, `list`) and layers on:
  - `listByUserId(userId)` — full inbox, newest first, no pagination (bounded by the cap).
  - `insertMany(rows)` — bulk write in one round-trip with `ordered: false` so a single bad row doesn't abort the batch.
  - `deleteOwned(userId, id)` — deletes one row only if it belongs to the caller; returns `false` for both "not found" and "not yours".
  - `deleteAllOwned(userId)` — empties a user's inbox.
  - `deleteByUserId(userId, session?)` — same as above but accepts a Mongoose `ClientSession` for participation in an account-deletion transaction.
  - `markAllRead(userId, readAt)` — stamps `readAt` on rows where it is currently absent; already-read rows are untouched.
  - `trimToNewest(userId, keep)` — removes everything older than the newest `keep` rows; returns the deleted `_id` strings.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides `createRepository` (the base CRUD spread), `toObjectId` (validation gate used in every filter), and the `Repository` / `Wire` types that shape the exported object.
- **`src/modules/notifications/model.ts`** — supplies `notificationModel` (the Mongoose model) and `applyNotificationTransform` (field transform applied on reads via the base factory).
- **`src/modules/notifications/services/inbox.ts`** — consumes `listByUserId`, `deleteOwned`, `deleteAllOwned`, `markAllRead`, and `trimToNewest` to implement inbox reads and user-initiated mutations.
- **`src/modules/notifications/services/subscribers.ts`** — calls `insertMany` when a product-level event fans out one notification per affected user.
- **`src/modules/notifications/tests/factories.ts`** — constructs `NewNotification` fixtures consumed by tests.
- **`src/modules/notifications/tests/integration/service.test.ts`** — exercises the service layer end-to-end against this repository.

## Notes

- **Ownership is a query property.** No method reads or deletes without a `userId` filter, so a foreign `userId` simply yields zero rows (→ 404 upstream) rather than requiring a post-query check.
- **`toObjectId` throws on malformed input.** This is deliberate: a bad id is a 4xx, not a 500. Every method is `async` partly to make that throw surface as a rejection the caller maps to a status code.
- **`deleteOwned` conflates "not found" and "not yours"** into the same `false`. The service layer treats both identically (404); do not expect the repository to distinguish them.
- **`insertMany` is `ordered: false`.** One bad row fails alone; the rest still land. Callers must check the returned array length against the input if they need full-or-nothing semantics (they don't today).
- **`trimToNewest` is two queries** (find-then-delete). It is not atomic; a concurrent insert between the two steps could leave a row above the cap for one tick.
- **Explicit type annotation on `notificationRepository`** exists because Mongoose generics are too large for TS to infer across an export boundary (TS7056). Don't remove it in favour of `as const` or inference.
