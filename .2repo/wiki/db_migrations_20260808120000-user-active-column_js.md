# db/migrations/20260808120000-user-active-column.js

## Purpose

Adds a stored `active` boolean to the `users` MongoDB collection and backfills it with `true` for every existing row. The column exists to represent "is this account enabled" as a fact independent of soft-deletion (`deletedAt`), so that deactivation and deletion remain orthogonal concerns.

## Key elements

- **`up(db)`** — Runs `updateMany` on `users` with filter `{ active: { $exists: false } }`, setting `active: true`. The `$exists` guard ensures re-running the migration will not overwrite a value an admin has since set.
- **`down(db)`** — Runs `updateMany` with `$unset: { active: '' }` across all documents, removing the field entirely.

## Relationships

No dependency-graph neighbors recorded.

## Notes

- **Idempotency is query-level, not framework-level.** `migrate-mongo status` tracks whether the migration ran, but the real guarantee against data loss on re-execution is the `$exists: false` filter in the `up` query. Do not remove it.
- **`down` is lossy.** Unsetting the field erases the distinction between "backfilled to `true`" and "set to `true` by an admin." There is no way to recover that after a rollback.
- **Design intent (from header comment):** every row gets `true`, including soft-deleted ones. The deliberate choice against `active = !deletedAt` is to avoid re-coupling the two facts at the moment the column is introduced.
