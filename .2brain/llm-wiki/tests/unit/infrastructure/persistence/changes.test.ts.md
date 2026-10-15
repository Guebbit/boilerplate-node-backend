---
source: tests/unit/infrastructure/persistence/changes.test.ts
sha256: 386025b6459ad9e81ca655484260c4243c95bdfde3328a004239af46748b73bd
generated_at: 2026-10-15T13:17:54.563233+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/changes.test.ts

## Purpose

Unit tests for the two helpers in `changes.ts` that turn a change-set into a Mongo `$set`/`$unset` pair before save. They pin down the exact null/undefined semantics every module's `update()` relies on.

## Key elements

- **`describe('clearedOrValue')`** — verifies `null → undefined` (the signal for `$unset`) and that all other values (`'x'`, `0`, `false`) pass through unchanged.
- **`describe('setAndUnset')`** — verifies the object-splitting logic:
  - `undefined` values land in `$unset` (with a literal `1`); everything else lands in `$set`.
  - Falsy-but-defined values (`0`, `false`, `''`, `null`) stay on the `$set` side.
  - An empty half is omitted entirely (e.g. `{ $unset: { a: 1 } }` has no `$set` key; `{}` returns `{}`).

## Relationships

- **Imports** `clearedOrValue` and `setAndUnset` from `@infrastructure/persistence/changes` → `src/infrastructure/persistence/changes.ts`. This is the sole production dependency; the file under test is the only module imported.

## Notes

- The critical convention under test: **only `undefined` triggers `$unset`**. `null`, `0`, `false`, and `''` are all treated as legitimate values to `$set`. If a future change makes `setAndUnset` also treat `null` as "clear," the second `setAndUnset` test (`gone: null` on the set side) will catch it.
- `clearedOrValue` is the bridge: it converts `null → undefined` so that downstream `setAndUnset` can apply its single "undefined means unset" rule.
