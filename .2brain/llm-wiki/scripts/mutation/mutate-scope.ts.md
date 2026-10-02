---
source: scripts/mutation/mutate-scope.ts
sha256: 1de710fd46f980211252ae0904f2a75d1f4b0e4bd3388847958dffba4d5e3c2c
generated_at: 2026-10-01T12:33:24.471485+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/mutate-scope.ts

## Purpose

Determines the mutation-testing scope by reading `stryker.json`'s `mutate` globs directly (rather than maintaining a hand-copied module list) and exposing the set of mutable `.ts` files with line counts. Exists so that sharding, diff filtering, and CI orchestration all agree on *what* Stryker will measure, without re-globbing independently.

## Key elements

- **`isMutable(file, patterns?)`** — Returns `true` if a repo-root-relative POSIX path matches any include pattern and no `!`-prefixed exclude pattern. Uses `minimatch` (Stryker's own matcher). Patterns default to `stryker.json`'s live `mutate` array; tests can inject their own.
- **`mutableFiles()`** — Walks `src/` recursively, collects `.ts` files, filters through `isMutable`. Returns repo-root-relative POSIX paths.
- **`lineCount(file)`** — Counts non-blank lines in a file (close approximation of Stryker's mutable-line count, sufficient for shard sizing).
- **`scopeWithLines()`** — Convenience: `mutableFiles()` mapped to `{ file, lines }` objects, the shape `packIntoShards` expects.
- **`changedMutable(changed, mutable)`** — Pure set-intersection of a diff's changed-file list with the mutable list. No git, no filesystem; safe to unit-test with plain arrays.

## Relationships

- **`scripts/mutation/run-diff.ts`** — Calls `changedMutable` as its core logic; its entrypoint is a thin wrapper that assembles the two arrays and delegates.
- **`scripts/mutation/run-shards.ts`** — Consumes `scopeWithLines()` to obtain the `{file, lines}` pairs it packs into shards.
- **`scripts/mutation/ci/cli.ts`** — CI entrypoint that relies on the scope this module defines when orchestrating waves/shards.
- **`tests/unit/scripts/mutation/mutate-scope.test.ts`** — Unit-tests `isMutable` (with injected patterns), `changedMutable`, and the scope-building logic.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Expects a stable mutable-file list from this module when simulating wave assignments.

## Notes

- `REPO_ROOT` is derived from `__dirname/../..`, **not** `process.cwd()`. All path construction assumes the script runs from its own location in the repo tree.
- Patterns are re-read from `stryker.json` on every call (`mutatePatterns()`). This is intentional: the process is a short-lived CLI, so caching would only add stale-data risk.
- `mutableFiles()` hardcodes the walk root to `src/`. If `stryker.json`'s globs ever extend beyond `src/`, the walk root must be widened in lockstep.
- `changedMutable` deliberately avoids re-evaluating globs: it trusts that the `mutable` argument already *is* the glob-resolved scope, so a deleted file (absent from the tree) drops out for free without a separate existence check.
- The file is `@module`-scoped (no default export); all public API is via named exports.
