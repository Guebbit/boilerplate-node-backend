---
source: src/infrastructure/runtime/database-snapshot.ts
sha256: 01b4b6591093e0ad77f759dcf5c569f5e28cd14c0da33586c7434ddb5447a47a
generated_at: 2026-09-23T17:51:09.454394+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/database-snapshot.ts

## Purpose

Provides the demo profile's database restore machinery: emptying all collections, capturing the entire database into memory as raw BSON, and replaying that copy back. Split out of `database.ts` because connection lifecycle is a separate concern, and only two call sites (`app/demo.ts`, `scenarios/apply.ts`) need snapshot/replay.

## Key elements

- **`emptyDatabase()`** — Deletes all documents in every collection via `deleteMany({})`. Deliberately avoids `dropDatabase()` so that Mongoose-built indexes (unique, TTL) are preserved.
- **`isDatabaseEmpty()`** — Returns `false` as soon as any collection holds a document (early-exit). Used as a guard against seeding non-idempotent flows onto existing data.
- **`DatabaseCopy`** (type) — `Readonly<Record<string, Document[]>>`, keyed by **collection name** (not model). `Document` is the MongoDB driver's raw shape, not a Mongoose document.
- **`captureDatabase()`** — Reads every collection into a `DatabaseCopy`. Includes collections no model claims (e.g. migration bookkeeping). Intended solely for the small, disposable demo database.
- **`restoreDatabaseCopy(copy)`** — Calls `emptyDatabase()` then re-inserts each non-empty collection with `insertMany(…, { ordered: false })` so a single bad document doesn't abort the batch. Not safe to run concurrently with itself.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — Source of the `connection` object imported here. This file was extracted from it to isolate snapshot/replay from connection lifecycle.
- **`src/app/demo.ts`** — Primary consumer: calls `captureDatabase()` / `restoreDatabaseCopy()` to replay a pre-recorded `shop` scenario instead of re-running the full seed flow (14 bcrypt-12 hashes + HTTP). Also calls `emptyDatabase()`.
- **`scenarios/apply.ts`** — Calls `isDatabaseEmpty()` as a pre-flight guard (refuses to seed if data exists) and `emptyDatabase()` behind its `--reset` flag.

## Notes

- **Why `deleteMany` over `dropDatabase`:** Mongoose builds indexes only at connect and schema-compile time. Dropping the database silently destroys those indexes until process restart, breaking unique constraints and TTL expiry.
- **`insertMany` with `ordered: false`:** One rejected document logs its error but the rest of the collection still inserts; the caller sees every problem, not just the first.
- **Empty-collection guard:** `insertMany([])` throws in the driver, so `restoreDatabaseCopy` filters out zero-length arrays before inserting.
- **Concurrency:** `restoreDatabaseCopy` is not self-serializing; `demo.ts`'s restore queue is the sole guarantee against overlapping replays colliding on `_id`.
- **Capture is heap-resident:** A full in-memory copy of the database is only acceptable because the demo profile's data is small and disposable. Do not generalize this pattern to production-sized databases.
