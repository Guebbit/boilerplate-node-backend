---
source: scenarios/support/database-snapshot.ts
sha256: 9b8ceab42f1361d0f1c272adfea2ab6f32dac88b2d9c098ebd0c564c849c9a48
generated_at: 2026-10-14T07:02:08.000594+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/database-snapshot.ts

## Purpose

Provides the demo profile's database snapshot machinery — emptying, capturing, and restoring the full database as raw BSON documents. Split out of `src/infrastructure/runtime/database.ts` because connection lifecycle and snapshot/replay are separate concerns, and only `./demo` and `scenarios/apply.ts` need this half.

## Key elements

- **`emptyDatabase()`** — Issues `deleteMany({})` on every collection in `connection.collections`. Intentionally avoids `dropDatabase()` so Mongoose-built indexes (unique, TTL) survive.
- **`isDatabaseEmpty()`** — Returns `false` at the first collection with any document; used as a seeding guard.
- **`DatabaseCopy`** (type) — `Readonly<Record<string, Document[]>>`, keyed by collection *name*, holding the driver's raw `Document` shape (no Mongoose hydration).
- **`captureDatabase()`** — Reads every registered collection via `find().toArray()` with `maxTimeMS: JOB_MAX_TIME_MS`; returns a `DatabaseCopy`.
- **`restoreDatabaseCopy(copy)`** — Calls `emptyDatabase()`, then `insertMany(documents, { ordered: false })` for each non-empty entry in the copy. Empty arrays are filtered out because the driver rejects `insertMany([])`.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — Imports `connection` (Mongoose connection, whose `.collections` map drives the iteration) and `JOB_MAX_TIME_MS` (query timeout for `captureDatabase`).
- **`scenarios/support/demo.ts`** — Caller of `captureDatabase` and `restoreDatabaseCopy` (via its `restoreScenario` flow) to replay a snapshot instead of re-running the full seed HTTP flow.
- **`scenarios/apply.ts`** — Caller of `emptyDatabase` (its `--reset` flag) and `isDatabaseEmpty` (guard that refuses to seed over existing data, since the apply flows are non-idempotent).

## Notes

- **Concurrency:** `restoreDatabaseCopy` must not run concurrently with itself; two overlapping replays of the same copy collide on `_id`. `./demo`'s restore queue is what serialises calls.
- **Collection scope:** Iteration is over `connection.collections`, which lists only collections a model or an explicit `connection.collection()` call registered. A collection that exists in MongoDB but has no registered model is neither emptied nor copied.
- **Raw driver types:** All document I/O uses the `mongodb` driver's `Document` type — no Mongoose `Model` hydration or validation is applied in either direction.
