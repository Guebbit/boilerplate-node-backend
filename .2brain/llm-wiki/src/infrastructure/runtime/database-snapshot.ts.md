---
source: src/infrastructure/runtime/database-snapshot.ts
sha256: 9c3d4da748d6bf40d15015e329d9c149eb99a02b5f9043a1c9f8d008b71b04d8
generated_at: 2026-09-27T14:14:59.819717+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/database-snapshot.ts

## Purpose

Demo-profile database restore machinery: empty every collection, read the whole database into memory as raw BSON, and replay that copy back. Split out of `database.ts` because connection lifecycle and snapshot capture/replay are separate concerns, and only the two demo callers (`src/app/demo.ts`, `scenarios/apply.ts`) need this half.

## Key elements

- **`emptyDatabase()`** — `deleteMany({})` on every collection in `connection.collections`. Deliberately avoids `dropDatabase()` so Mongoose indexes (unique, TTL) survive the reset.
- **`isDatabaseEmpty()`** — Returns `true` only if every collection has zero documents. Used as an idempotency guard before seeding.
- **`DatabaseCopy`** (type) — `Readonly<Record<string, Document[]>>`, keyed by collection *name*. `Document` is the driver's raw BSON shape, not a Mongoose-hydrated doc.
- **`captureDatabase()`** — Reads every collection into a `DatabaseCopy` in one pass. Exists so `shop`-profile restore can replay a pre-baked state instead of re-running 14 bcrypt cost-12 hashes and an HTTP flow.
- **`restoreDatabaseCopy(copy)`** — Calls `emptyDatabase()`, then `insertMany` (with `ordered: false`) into each non-empty collection from the copy. Empty collections are skipped because `insertMany([])` throws in the driver.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — Imports `connection` from it; all operations go through `connection.collections` / `connection.collection()`.
- **`src/app/demo.ts`** — Calls `captureDatabase()` and `restoreDatabaseCopy()` inside its `restoreScenario` flow; its internal restore queue is what serialises overlapping replays.
- **`scenarios/apply.ts`** — Calls `emptyDatabase()` for its `--reset` flag and `isDatabaseEmpty()` as a guard before non-idempotent seeding flows.

## Notes

- `restoreDatabaseCopy` **must not** run concurrently with itself; two overlapping replays collide on `_id`. The sole safety net is the caller's queue (in `demo.ts`).
- The collection walk is over `connection.collections`, which only lists collections a Mongoose model or an explicit `connection.collection()` call registered. A collection that exists only in MongoDB (e.g. created ad-hoc) is invisible to every function here.
- `ordered: false` on `insertMany` is intentional: a single bad document does not abort the rest of the batch, so the resulting error lists every offending document rather than stopping at the first.
- `Document` throughout is the **driver's** type (`mongodb` package), not `mongoose.Document`. No schema validation or virtuals apply in either the capture or the restore path.
