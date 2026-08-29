# db/migrations/20260808200000-users-email-unique.js

## Purpose

Adds a **unique** index on `users.email` in MongoDB, closing a check-then-insert race in `authService.signup` that allows two concurrent signups to create duplicate accounts on the same address. The migration runs only against an *existing* deployed database where the old non-unique `users_email` index already exists; it refuses to proceed if duplicate emails are present.

## Key elements

- **`findDuplicateEmails(db)`** — Aggregation pipeline that returns every email address held by more than one document, sorted worst-first, along with the offending `_id` values. Excludes `null`/missing emails (`$type: 'string'` match).
- **`module.exports.up(db)`** — (1) Runs the duplicate scan; if any exist, throws an `Error` with a full report of every duplicate address, account count, and IDs, and does **not** merge or delete anything. (2) Best-effort `dropIndex('users_email')` (swallows the error if the index never existed). (3) `createIndex({ email: 1 }, { name: 'users_email', unique: true })`.
- **`module.exports.down(db)`** — Drops the unique `users_email` index and recreates it as non-unique under the **same name**, restoring pre-migration behavior.

## Notes

- **Duplicate emails block the migration.** The migration intentionally refuses to choose which account survives; a human must merge or delete the extras before re-running.
- **Drop-then-recreate, not alter.** MongoDB has no in-place index-option change; this is the only supported path.
- **Index name is load-bearing.** Both `up` and `down` use the literal name `users_email` to stay consistent with the Mongoose schema (`src/models/users.ts`) and any other migrations that reference it. A derived/auto-generated name would break startup.
- **Rolling back re-opens the signup race.** The `down` path is documented as knowingly re-introducing the concurrency gap.
- **Best-effort drop.** Both `up` and `down` wrap `dropIndex` in a `try/catch` so a fresh database (where the index was never created) does not fail the migration.
