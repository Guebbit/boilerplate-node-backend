---
source: tests/unit/scripts/mutation/mutate-scope.test.ts
sha256: 339b07239ca88977a8a178b798c5968e9898f3368ee462e13b9b5207908a9fc0
generated_at: 2026-09-23T20:31:33.615601+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/mutate-scope.test.ts

## Purpose

Unit tests for the two exported helpers in `mutate-scope.ts`: `isMutable` (does a path fall inside Stryker's mutate globs?) and `changedMutable` (intersection of a diff's changed-file list with that scope). The file keeps these pure path-filtering functions covered in isolation so the CLI wrapper in `run-diff.ts` stays thin and untested.

## Key elements

- **`PATTERNS`** — a small, hand-reasonable fixture array of include/exclude globs that stands in for the real `mutate` field in `stryker.json`.
- **`describe('isMutable')`** — five cases: accepts paths matched by include globs (`infrastructure/**`, `kernel/**`, `modules/*/**`), rejects barrel files (`*/index.ts`) and test files (`*/tests/**`) via the `!` exclusions, and rejects paths no include glob covers.
- **`describe('changedMutable')`** — two cases: returns only the intersection of a changed list and a mutable list; returns `[]` when the two sets are disjoint.

## Relationships

- **`scripts/mutation/mutate-scope.ts`** — the sole subject under test. The test imports `isMutable` and `changedMutable` directly and exercises them with synthetic path arrays; no mocking, no filesystem access.

## Notes

- Follows the same convention as `local-policy.test.ts`: test the pure logic, not the CLI wrapper that calls it.
- The `changedMutable` test comment references a historical bug ("B27") that conflated _deleted files_ (absent from `mutableFiles()` output) with _glob-excluded files_ — both surface as "in the diff but not in scope." The test pins the expected behavior for both.
- Globs use `*` (single segment) rather than `**` for the module pattern, which is why `src/modules/*/**/*.ts` matches `src/modules/orders/service.ts` but not `src/modules/service.ts`.
