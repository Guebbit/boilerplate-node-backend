---
source: scenarios/support/database-snapshot.ts
source_sha256: 797b7094881619b633073d9a3302328fc2c162d9a32667eec259056d99ae704e
context_sha256: 2f3a5a5e5865ffa770acaf4ca0b8cbd6c0f8f0352398d7a242cf3c73ba571eec
generated_at: 2026-11-22T01:46:24.819181+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/support/database-snapshot.ts

## Purpose
Restore machinery for the demo profile's database: empty it, read it whole into memory, and write a copy back. It was split out of `src/infrastructure/runtime/database.ts` so connection lifecycle stays separate from snapshot and replay. Only `./demo` and `scenarios/apply.ts` use it.

## Key elements
- `SEED_MARKER_COLLECTION` (`'seed_marker'`): the name of the seeder's note collection. It holds one document with id `'seed'`.
- `SeedMarkerState`: `'running' | 'done'`.
- `emptyDatabase(keep = [])`: runs `deleteMany({})` on every collection in `connection.collections` except the names in `keep`. It never drops the database.
- `isDatabaseEmpty()`: returns `true` if every collection is empty. It ignores `leases` and the seed marker, and stops at the first non-empty collection.
- `readSeedMarker()`: returns the marker's state, or `undefined` if none was written.
- `writeSeedMarker(state)`: upserts the marker document.
- `DatabaseCopy`: a readonly record of collection name to raw driver `Document[]`, with no Mongoose hydration.
- `captureDatabase()`: reads every document in every registered collection into a `DatabaseCopy`. Each `find` uses `maxTimeMS: JOB_MAX_TIME_MS`.
- `restoreDatabaseCopy(copy)`: calls `emptyDatabase()`, then `insertMany(..., { ordered: false })` for each non-empty collection in the copy.

## Relationships
- **`src/infrastructure/runtime/database.ts`**: this file imports `connection` and `JOB_MAX_TIME_MS` from it. Every collection walk and seed-marker read or write goes through that `connection`.
- **`scenarios/support/demo.ts`**: calls `emptyDatabase` from `restoreScenario`. It also uses `captureDatabase` and `restoreDatabaseCopy` so a `shop` restore replays a copy instead of reseeding. Its restore queue prevents concurrent replays.
- **`scenarios/apply.ts`**: uses `emptyDatabase` for `--reset`. It uses `isDatabaseEmpty` as a guard, because its flows are not idempotent and seeding on top of existing data is refused.

## Notes
- `emptyDatabase` deliberately avoids `dropDatabase()`. A drop discards index builds, and Mongoose does not re-run `Model.init()`, so unique and TTL indexes stay gone until the process restarts. Emptying keeps the collections and their indexes.
- The seed marker is written as `running` before the first write and as `done` as the last. The seeder passes its collection to `emptyDatabase`'s `keep`, so a crash mid-wipe still leaves `running` for the next boot.
- Only collections registered on the connection by a model or a `connection.collection()` call are walked. A collection that exists only in the database is neither copied nor emptied.
- `restoreDatabaseCopy` skips empty collections because `insertMany([])` errors in the driver. It must not run concurrently with itself, since overlapping replays collide on `_id`.
- `captureDatabase` holds the whole database in the process heap. That is only acceptable because the demo database is small and disposable.
- `restoreDatabaseCopy` calls `emptyDatabase()` with no `keep` list, so the seed marker is emptied along with everything else.
