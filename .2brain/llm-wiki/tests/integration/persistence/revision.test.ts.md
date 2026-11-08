---
source: tests/integration/persistence/revision.test.ts
sha256: 6a3f453ed7cc278f4bb76d90936df9a88ff756c56f04bced5d9070d58fdb1abf
generated_at: 2026-11-08T09:45:16.691785+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/revision.test.ts

## Purpose

Integration test for the edit-revision counter (`revisionPlugin`) run against a real MongoDB instance. It verifies guarantees that unit-level mocks cannot: the counter increments via a server-side `$inc` (no lost updates under concurrency), it moves only when `updatedAt` actually changes, and it behaves correctly across every write form the repositories use. A scratch Mongoose model carries the plugin so the property is exercised generically, not tied to one domain model.

## Key elements

- **`Probe` / `probeModel`** – A minimal Mongoose model (`name: string`, `tags: string[]`) with `revisionPlugin` applied and `applySerialization` wrapped. Serves as the SUT carrier.
- **`storedRevision(id)`** – Reads the raw `EDIT_REVISION` field straight off the collection via `.lean()`, bypassing any virtuals or serialization.
- **`describe('editRevision')`** – The test suite covering:
  - Initial state (counter = 0, no `__v`).
  - `save()` with a dirty field increments by exactly 1.
  - Concurrent `save()` from two in-memory copies of the same row both increment (no lost update).
  - No-op `save()`, `save({ timestamps: false })` do **not** increment.
  - `markModified('updatedAt')` with a time advance **does** increment.
  - `updateOne`, `updateMany`, `findOneAndUpdate`, and an update-pipeline `updateOne` all increment.
  - `updateOne({ timestamps: false })` does **not** increment; manually setting `updatedAt` with timestamps off **does**.
  - The counter is absent from both `.toJSON()` and the serialized lean shape, yet recoverable via `versionOf`.

## Relationships

- **`src/infrastructure/persistence/revision-plugin.ts`** – Source under test. Supplies `revisionPlugin` (Mongoose plugin) and the `EDIT_REVISION` field-name constant.
- **`src/infrastructure/persistence/serialize.ts`** – `applySerialization` is wrapped around the schema to confirm the counter is stripped from the wire shape.
- **`src/infrastructure/persistence/versioning.ts`** – `versionOf` is called on hydrated and lean documents to verify the counter is still recoverable after serialization.
- **`tests/support/clock.ts`** – `freezeDate` / `advanceDate` give the "updatedAt-only change" test a deterministic time gap so the timestamp actually differs.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` connects the test process to a real MongoDB before the suite runs.

## Notes

- The concurrency test ("two writers hold the same copy") passes only if the plugin uses `$inc` under the hood; a read-then-write strategy would fail it. This is the primary reason the test exists against a real DB.
- The `markModified('updatedAt')` test calls `jest.useRealTimers()` in a `finally` block, implying `freezeDate` switches to fake timers; forgetting the restore would leak timer state into other tests.
- The serialization-exclusion test checks **both** the hydrated `.toJSON()` path and the lean + `transform` path, guarding against the field leaking through either route.
- No test asserts the counter value for `create()` itself beyond the initial 0; the plugin is expected to seed 0 in a `pre('save')` or `init` hook, not in the schema `default`.
