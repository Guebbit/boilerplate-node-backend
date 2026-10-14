---
source: scripts/mutation/mutate-scope.ts
sha256: 77f8de5d9d83932fd9c708f0290cc86048537bf0936cea4431d5e084cb171322
generated_at: 2026-10-14T07:20:32.847235+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/mutate-scope.ts

## Purpose

Resolves Stryker's mutation-test scope at runtime from `stryker.json`'s `mutate` globs, producing the list of mutable `.ts` files, their line counts, and a helper to intersect a diff's changed files with that scope. Exists to eliminate hand-maintained module lists that drift when new modules are added to `stryker.json`.

## Key elements

- **`isMutable(file, patterns?)`** — Returns `true` when a repo-root-relative POSIX path matches at least one non-negated glob and zero `!`-prefixed globs (Stryker's include-then-exclude semantics). Uses `minimatch` (Stryker's own matcher) so the verdict matches Stryker's. Defaults `patterns` to the live `stryker.json` value; tests may inject their own array.
- **`mutableFiles()`** — Recursively walks `src/` for `.ts` files, then filters through `isMutable`. Returns repo-root-relative POSIX paths.
- **`lineCount(file)`** — Counts non-blank lines in a given file (a proxy for Stryker's mutable-line count, sufficient for shard sizing).
- **`scopeWithLines()`** — Returns `{ file, lines }[]` for every mutable file; the shape `packIntoShards` (in `run-shards.ts`) consumes.
- **`changedMutable(changed, mutable)`** — Pure set-intersection: keeps only the `changed` entries that appear in `mutable`. No filesystem or git access.
- **`mutatePatterns()`** *(internal)* — Reads `stryker.json` fresh on each call (short-lived CLI, no caching) and returns the `mutate` string array.
- **`REPO_ROOT`** *(internal)* — Derived from `__dirname` so resolution is cwd-independent.

## Relationships

- **`scripts/mutation/run-diff.ts`** — Calls `changedMutable` as a thin wrapper: computes the git diff, gets `mutableFiles()`, then passes both arrays in. Keeps the entrypoint free of glob logic.
- **`scripts/mutation/run-shards.ts`** — Consumes `scopeWithLines()` to obtain the `{file, lines}[]` input for its shard-packing algorithm.
- **`scripts/mutation/ci/cli.ts`** — CI orchestration layer that drives the mutation-testing pipeline; depends on the scope this module provides.
- **`tests/unit/scripts/mutation/mutate-scope.test.ts`** — Unit tests that exercise `isMutable` with injected pattern arrays, `mutableFiles`, `lineCount`, `scopeWithLines`, and `changedMutable`.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — CI wave tests that indirectly depend on the scope definitions this module exports.

## Notes

- `mutatePatterns()` re-reads `stryker.json` on every call. This is intentional (CLI lifecycle) but means the file must exist and be valid JSON at call time; there is no graceful fallback.
- The include/exclude split mirrors Stryker's documented behavior: all include patterns are evaluated first (any match → candidate), then all exclude patterns (any match → rejected). A file with no include match is never mutable regardless of excludes.
- `changedMutable` does **not** re-evaluate globs. It trusts that `mutable` was already filtered by `mutableFiles()`. A file deleted after the diff was computed simply won't appear in `mutable` and drops out naturally.
- Path separators: all public functions use POSIX `/` internally. The walk in `mutableFiles` uses `path.sep` on Windows but normalises to `/` before returning.
