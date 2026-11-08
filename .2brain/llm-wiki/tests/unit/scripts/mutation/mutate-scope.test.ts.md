---
source: tests/unit/scripts/mutation/mutate-scope.test.ts
sha256: d831a198a7660c5a0453c86253a9a0f3c890acf188768225cf3dd7646fd8a600
generated_at: 2026-11-08T10:39:11.436032+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/mutate-scope.test.ts

## Purpose

Unit tests for the `isMutable` and `changedMutable` helpers in `scripts/mutation/mutate-scope.ts`. They verify that file-path filtering against Stryker's `mutate` glob patterns and the diff/scope intersection behave correctly, keeping the CLI wrapper (`run-diff.ts`) a thin, untested passthrough.

## Key elements

- **`PATTERNS`** – A module-level fixture array of five glob strings (includes for `infrastructure`, `kernel`, and `modules/*`, plus two negation patterns for barrels and test dirs). Shared by every `isMutable` test so behavior is easy to reason about by hand.
- **`describe('isMutable', …)`** – Five cases: positive matches (module, infrastructure, kernel), negative matches via negation globs (`index.ts`, `tests/**`), and negative matches where no include glob covers the path at all.
- **`describe('changedMutable', …)`** – Two cases: filtering a mixed changed-list to only the file present in both the diff and the mutable set, and the empty-intersection case.

## Relationships

- **`scripts/mutation/mutate-scope.ts`** – The sole import source. The test exercises `isMutable(path, patterns)` and `changedMutable(changed, mutable)` directly; no other production code is touched.

## Notes

- The file header explicitly frames this as a "pure input/output" test in the same style as the neighboring `local-policy.test.ts`; the CLI layer is intentionally left untested.
- The `changedMutable` "keeps only what both name" test includes a comment distinguishing two *different* reasons a changed file may be non-mutable (deleted since mutation walk vs. excluded by Stryker's globs). This distinction matters for future refactors of `mutableFiles()`.
- Negation globs (`!…`) are the mechanism by which barrels and test directories are excluded; tests confirm they override the broader include globs.
