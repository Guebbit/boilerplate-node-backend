---
source: tests/integration/persistence/revision.test.ts
sha256: 0941a5008b7a8772593d0993dd51c41e30c337ee015432598bde0302b8eb013a
generated_at: 2026-10-15T12:50:33.575434+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/revision.test.ts

## Purpose

Integration tests that exercise the `revisionPlugin` edit counter against a real MongoDB instance. The goal is to verify behaviors a mock cannot capture: that the counter increments via a server-side `$inc` (making concurrent writers safe), that it tracks `updatedAt` movements exactly, and that it fires across every Mongoose write form the repositories use. A throwaway `RevisionProbe` model carries the plugin so the property tested belongs to the plugin itself, not to any application schema.

## Key elements

- **`Probe` interface / `probeSchema` / `probeModel`** — Minimal Mongoose model (`name`, `tags`) registered as `RevisionProbe`, with `revisionPlugin` applied and `applySerialization` wired in. Serves as the scratch vehicle for all assertions.
- **`storedRevision(id)`** — Reads the raw `EDIT_REVISION` field straight off the collection via `.lean()`, bypassing any document-level masking.
- **`describe('editRevision')` block** — 11 test cases covering: initial value (0, no `__v`), increment on edited `save()`, concurrent-writer safety (two `save()`s → 2, not 1), no-op `save()`, opt-out via `timestamps: false`, `markModified('updatedAt')` as the sole change, all four query-update forms (`updateOne`, `updateMany`, `findOneAndUpdate`, update pipeline), manual `updatedAt` stamp with timestamps off, and wire-shape exclusion (counter absent from `toJSON()` / `transform()` output while `versionOf` still reports the correct number).

## Relationships

- **`src/infrastructure/persistence/revision-plugin.ts`** — Provides `revisionPlugin` (the schema plugin under test) and the `EDIT_REVISION` field name constant. The tests assert its increment, placement, and absence from serialized output.
- **`src/infrastructure/persistence/serialize.ts`** — `applySerialization` is applied to the probe schema so one test can confirm the counter is stripped from the lean/wire shape via `transform()`.
- **`src/infrastructure/persistence/versioning.ts`** — `versionOf` is used to read the in-memory version after a `save()` and to verify the counter survives serialization for both hydrated and lean documents.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to provision and connect a real MongoDB instance before any test runs.

## Notes

- `setupTestDb()` is invoked as a top-level side effect (not inside a `beforeAll`), so the DB connection is established at import time.
- The concurrent-writer test (`two writers hold the same copy`) deliberately skips `If-Match` / optimistic-lock headers; the contract being verified is that `$inc` in the plugin's `pre('save')` hook makes the counter safe by construction.
- The `it.each` table uses a trailing `write` function that receives the `_id` as `unknown`; the test casts implicitly through Mongoose's generic model.
- The "stays out of the wire shape" test asserts on both `toJSON()` (hydrated) and `transform(lean)` (lean) paths, confirming the counter is never leaked to API consumers in either form.
