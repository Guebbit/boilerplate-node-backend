# db/migrations/20260810120000-orders-soft-delete.js

## Purpose

Adds the soft-delete surface to the `orders` collection (a `deletedAt` field and its supporting compound index) so that orders participate in the same `visibleScope` / `ownerScope` filtering already used by products and users. It intentionally writes no data — the absence of the field *is* the "not deleted" state — and only creates the index the application actually queries.

## Key elements

- **`up(db)`** — Calls `createIndex({ userId: 1, deletedAt: 1 })` with name `orders_userId_deletedAt` on the `orders` collection. Idempotent by MongoDB semantics.
- **`down(db)`** — Drops `orders_userId_deletedAt` (tolerating errors 27/26 if the index or namespace is already gone), then `$unset`s `deletedAt` on every order document so no stale field lingers.

## Notes

- **No backfill is deliberate.** `visibleScope` filters with `$exists: false`, not a null check. Writing an explicit `null` into existing documents would *look* soft-deleted to that filter, so the migration must leave the field absent.
- **Compound index shape.** `{ userId: 1, deletedAt: 1 }` is chosen over `{ deletedAt: 1 }` because order reads are always owner-scoped first. Admins bypass the scope entirely and don't use this index.
- **`down` is safe to re-run.** It swallows MongoDB error codes 27 (`IndexNotFound`) and 26 (`NamespaceNotFound`) rather than failing the rollback.
- **`down` removes the field, not just the index.** Leaving `deletedAt` behind would hide records from a `visibleScope` query that still exists in application code until the rollback is complete.
