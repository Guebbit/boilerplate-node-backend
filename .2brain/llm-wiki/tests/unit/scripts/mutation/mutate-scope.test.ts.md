---
source: tests/unit/scripts/mutation/mutate-scope.test.ts
sha256: d831a198a7660c5a0453c86253a9a0f3c890acf188768225cf3dd7646fd8a600
generated_at: 2026-10-15T13:28:51.082903+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/mutate-scope.test.ts

## Purpose

Unit tests for the two pure helper functions exported by `scripts/mutation/mutate-scope.ts`: `isMutable` (does a single path fall inside Stryker's `mutate` glob set?) and `changedMutable` (intersection of a diff's changed paths with the mutable set). The tests are deliberately I/O-only so the surrounding CLI wrapper in `run-diff.ts` can remain a thin, untested adapter.

## Key elements

- **`PATTERNS`** – A fixed five-glob array (three positive, two negative) that stands in for the `mutate` field of `stryker.json`. Small enough to verify by hand.
- **`describe('isMutable')`** – Five cases covering: positive matches (modules, infrastructure, kernel), negative matches (barrel `index.ts`, test files excluded by `!` globs), and files outside any include glob.
- **`describe('changedMutable')`** – Two cases: intersection keeps only the file present in both lists, and returns an empty array when the two lists share nothing.

## Relationships

- **`scripts/mutation/mutate-scope.ts`** – The only import. Provides `isMutable` and `changedMutable`, which are the subjects under test. No other modules are touched.

## Notes

- The negative-glob cases (`!src/modules/*/index.ts`, `!src/modules/*/tests/**`) exist to lock in the distinction between "file was deleted since the diff was computed" and "file is excluded by Stryker's own globs." Both must yield `false` from `isMutable`, but for different reasons the test comment calls out.
- `changedMutable` is expected to return a **new** array (`.toEqual` rather than reference identity), so callers can rely on it not aliasing the input.
- Test philosophy (stated in the file header): these are "pure input/output" tests in the same spirit as the neighbouring `local-policy.test.ts`; no mocking, no filesystem access.
