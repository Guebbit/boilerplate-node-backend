---
source: tests/integration/persistence/revision.test.ts
sha256: 6a3f453ed7cc278f4bb76d90936df9a88ff756c56f04bced5d9070d58fdb1abf
generated_at: 2026-10-29T07:00:38.368647+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/revision.test.ts

## Purpose

Integration test for the edit-revision counter implemented by the Mongoose `revisionPlugin`. It runs against a real database (not a mock) to verify three things a unit test cannot: that the counter is bumped via a server-side `$inc` (so concurrent writers each get their increment), that it tracks `updatedAt` moves and nothing else, and that it survives every write form the repositories actually use. A throwaway `RevisionProbe` model carries the plugin so the property under test is the plugin's, not any domain module's.

## Key elements

- **`Probe` / `probeSchema` / `probeModel`** — Minimal test document (one string, one array) with `timestamps: true` and the `revisionPlugin` applied. Sufficient to drive `save`, `updateOne`, `updateMany`, `findOneAndUpdate`, and update-pipeline writes.
- **`transform`** — Serialization transform built via `applySerialization(probeSchema)`; used to assert the counter is stripped from the lean (wire) shape.
- **`storedRevision(id)`** — Helper that reads the raw counter value (`EDIT_REVISION`) straight from the collection via a `lean()` query.
- **`describe('editRevision')`** — Test cases covering: initial value 0 and absence of `__v`; single-save increment; concurrent-write atomicity; no-op save; `timestamps: false` opt-out; `markModified('updatedAt')`-only change; parameterized update forms; hand-stamped `updatedAt` with timestamps off; and serialization exclusion (hydrated `toJSON` and lean `transform` both hide the field while `versionOf` still reports it).

## Relationships

- **`src/infrastructure/persistence/revision-plugin.ts`** — Source of `revisionPlugin` (the Mongoose plugin under test) and `EDIT_REVISION` (the reserved field-name constant asserted on).
- **`src/infrastructure/persistence/serialize.ts`** — Provides `applySerialization`, which produces the `transform` used in the final test to confirm the counter is stripped from the wire shape.
- **`src/infrastructure/persistence/versioning.ts`** — Provides `versionOf`, used to assert the in-memory/document version matches the stored counter.
- **`tests/support/clock.ts`** — Provides `freezeDate` and `advanceDate`; used in the `updatedAt`-only-change test to guarantee a visible timestamp delta.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb`, called at module top to start a real MongoDB instance for the whole suite.

## Notes

- The "two writers" test saves both documents concurrently with `Promise.all` and expects the counter to reach **2**, proving the increment is a server-side `$inc` rather than a read-then-write.
- The `updatedAt`-only-change test must advance the fake clock by ≥ 1 ms (`advanceDate(10)`); within the same millisecond the timestamp is unchanged and the counter correctly stays put.
- `__v` (Mongoose's internal version key) is explicitly asserted absent — the plugin intentionally uses its own `EDIT_REVISION` field instead.
- The parameterized update-form test (`it.each`) covers `updateOne`, `updateMany`, `findOneAndUpdate`, and a v2 update pipeline; all must increment the counter identically.
