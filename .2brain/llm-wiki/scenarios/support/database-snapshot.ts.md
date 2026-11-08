---
source: scenarios/support/database-snapshot.ts
sha256: 9b8ceab42f1361d0f1c272adfea2ab6f32dac88b2d9c098ebd0c564c849c9a48
generated_at: 2026-11-08T02:32:32.753646+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/database-snapshot.ts

## Purpose

Provides the demo profile's database snapshot machinery: empty, capture, and restore. Split from `src/infrastructure/runtime/database.ts` because taking and replaying a snapshot is a distinct concern from connection lifecycle, and only two call sites (`scenarios/support/demo.ts` and `scenarios/apply.ts`) need this half.

## Key elements

- **`emptyDatabase(): Promise<void>`** — Deletes all documents from every registered collection via `deleteMany({})`. Deliberately avoids `dropDatabase()` to preserve Mongoose-built indexes (unique, TTL, etc.).
- **`isDatabaseEmpty(): Promise<boolean>`** — Short-circuit check; returns `false` on the first collection that holds any document.
- **`DatabaseCopy`** (type) — `Readonly<Record<string, Document[]>>`; a snapshot keyed by collection name holding raw BSON documents (no Mongoose hydration).
- **`captureDatabase(): Promise<DatabaseCopy>`** — Reads every document from every registered collection into memory. Used by the demo's `restoreScenario` to replay a prior state instead of re-running the full seeding flow.
- **`restoreDatabaseCopy(copy): Promise<void>`** — Calls `emptyDatabase()` then writes the copy back via `insertMany(documents, { ordered: false })`. Skips empty collections (the driver rejects `insertMany([])`).

## Relationships

- **`src/infrastructure/runtime/database.ts`** — Source of the `connection` handle and `JOB_MAX_TIME_MS` constant. This module was extracted from that file; it is the only dependency on the runtime database layer.
- **`scenarios/support/demo.ts`** — Calls `captureDatabase` and `restoreDatabaseCopy` inside its `restoreScenario`. The demo's restore queue is the sole mechanism preventing concurrent `restoreDatabaseCopy` invocations.
- **`scenarios/apply.ts`** — Uses `emptyDatabase` (its `--reset` flag) and `isDatabaseEmpty` as a guard before seeding, since its flows are non-idempotent.

## Notes

- All operations walk `connection.collections`, which lists only collections a Mongoose model or an explicit `connection.collection()` call has registered. A collection that exists only in MongoDB (unregistered) is invisible to every function here — neither copied nor emptied.
- `Document` throughout is the raw `mongodb` driver type, not a Mongoose document. Nothing hydrates on read or dehydrates on write.
- `restoreDatabaseCopy` must **not** run concurrently with itself; overlapping replays of the same copy collide on `_id`.
- `captureDatabase` holds the entire database in the process heap — only safe because the demo profile's database is small and disposable. Do not reuse for production-sized databases.
- `insertMany` is called with `ordered: false` so a single rejected document does not abort the remaining inserts for that collection; the resulting error reports all failures rather than just the first.
