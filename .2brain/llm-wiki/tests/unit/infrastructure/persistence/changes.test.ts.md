---
source: tests/unit/infrastructure/persistence/changes.test.ts
sha256: 386025b6459ad9e81ca655484260c4243c95bdfde3328a004239af46748b73bd
generated_at: 2026-11-08T10:21:37.100829+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/changes.test.ts

## Purpose

Unit tests for the two helpers in `@infrastructure/persistence/changes` that translate a module's change-set into a MongoDB update document (`$set` / `$unset`). They pin down the exact contract every `update()` implementation relies on when deciding which fields to write and which to clear.

## Key elements

- **`describe('clearedOrValue')`** — Verifies that `clearedOrValue` maps `null → undefined` (the signal for `$unset`) while passing through every other value unchanged, including falsy ones (`0`, `false`).
- **`describe('setAndUnset')`** — Verifies that `setAndUnset` partitions an input object into `{ $set: …, $unset: … }`:
  - `undefined` fields are routed to `$unset` (stored as `1`, the Mongo sentinel).
  - All other fields — including `null`, `0`, `false`, `''` — remain in `$set`.
  - An empty half is omitted entirely (e.g. `{ a: undefined }` produces only `{ $unset: { a: 1 } }`), and an empty input `{}` produces `{}`.

## Relationships

- **`src/infrastructure/persistence/changes.ts`** — The sole import target. This test file exercises `clearedOrValue` and `setAndUnset` exported from that module and no other.

## Notes

- **`null` ≠ `undefined`** is the single most important distinction: `null` is a *stored* value (kept in `$set`), while `undefined` is the *clear* signal (moved to `$unset`). Any refactor that conflates the two will break these tests.
- The "empty half is omitted" rule exists because MongoDB rejects an empty `$set: {}` operator; callers must not add empty operator keys.
