---
source: tests/unit/infrastructure/persistence/changes.test.ts
sha256: cbc18b8767344d8fba67e4962774b8f3bdd80f9f50342a987795238c1eaa7e80
generated_at: 2026-09-27T16:09:11.495986+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/changes.test.ts

## Purpose

Unit tests for the `clearedOrValue` helper, which every module's `update()` relies on to convert a change-set's `null` sentinel into `undefined` so that MongoDB emits `$unset` on save. The file exists to lock down this one-fact contract.

## Key elements

- **`describe('clearedOrValue')`** — single test suite covering the helper's two branches.
  - *Test 1:* asserts `clearedOrValue(null)` returns `undefined`.
  - *Test 2:* asserts that `'x'`, `0`, and `false` are returned unchanged (i.e., only `null` is special-cased; other falsy values are preserved).

## Relationships

- **`src/infrastructure/persistence/changes.ts`** — the module under test; this file imports `clearedOrValue` from it via the `@infrastructure/persistence/changes` path alias. No other production code is touched.

## Notes

- The test intentionally covers `0` and `false` to guard against a common bug where a truthiness check (`if (!value)`) would incorrectly clear those values.
- The expected output is `undefined` (not `null`) because the persistence layer maps `undefined` to a MongoDB `$unset` operator.
