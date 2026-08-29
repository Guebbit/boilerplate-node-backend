# db/migrations/20260808180000-prune-unused-indexes.js

## Purpose

Drops three MongoDB indexes that no application query actually uses, eliminating their write-amplification cost and memory footprint. It exists as a migration because dropping an index is the one index operation a schema definition cannot express — a schema declares what should exist, not what should stop existing.

## Key elements

- **`DROPS`** — array of `[collection, indexName]` tuples identifying the three indexes to remove: `users_deletedAt`, `auditlogs.timestamp_-1`, `feedbackrequests.email_1_createdAt_-1`.
- **`up(db)`** — iterates `DROPS`, calling `dropIndex` on each. Catches and discards errors so a database that never created a given index does not fail the migration (idempotent).
- **`down(db)`** — recreates all three indexes via `createIndex`. Preserves the explicit name `users_deletedAt` for the users index; the other two rely on Mongoose-derived naming.

## Relationships

No graph neighbors. This file is a standalone migration with no imports or imports-from.

## Notes

- **Idempotent up, destructive down.** The `up` path tolerates missing indexes; the `down` path does **not** check for existing indexes before creating, so running it twice will throw a duplicate-index error.
- **Index naming matters for rollback.** The `down` for `users` explicitly passes `{ name: 'users_deletedAt' }`. The comment warns that recreating under a different name would block the collection from accepting the original index name in a subsequent forward migration.
- **The redundant index rationale is recorded in the header comment:** `auditlogs.timestamp_-1` is functionally identical to the ascending TTL index on the same single field (a single-field B-tree is walked in either direction); `feedbackrequests.email_1_createdAt_-1` is never usable because the only matching query is case-insensitive and unanchored.
