---
source: scripts/mutation/mutate-scope.ts
sha256: d7421ee9991afa24dadcc97cb128a547234eb968a008d4763a62b5835dd1cd40
generated_at: 2026-11-14T17:37:39.731475+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/mutate-scope.ts

## Purpose

Resolves which source files fall inside Stryker's mutation-testing scope by reading `stryker.json`'s own `mutate` glob patterns at call time, then exposes that scope (as a file list, with per-file line counts, or as a filtered intersection against a diff) to the CI sharding and diff pipelines. Reading the globs fresh from the config file avoids the drift that occurs when a module is added to `stryker.json` but not to a hand-maintained list.

## Key elements

- **`isMutable(file, patterns?)`** — Returns `true` when a repo-root-relative POSIX path matches at least one non-negated `mutate` glob and no `!`-prefixed exclude glob (via `minimatch`, the same matcher Stryker uses). Defaults `patterns` to the live `stryker.json` value; tests inject their own array.
- **`mutableFiles()`** — Walks `src/` recursively, collects every `.ts` file, and filters with `isMutable`. Returns repo-root-relative, forward-slash-separated paths.
- **`lineCount(file)`** — Counts non-blank lines in a mutable file; used as the sizing unit for shards.
- **`scopeWithLines()`** — Combines the two above into `{ file, lines }[]`, the shape expected by `packIntoShards`.
- **`changedMutable(changed, mutable)`** — Pure set-intersection of a diff's changed files against the mutable scope. No filesystem or git calls; keeps `run-diff.ts`'s entrypoint thin and the function independently testable.
- **`mutatePatterns()`** (internal) — Reads and parses `stryker.json` each call (short-lived CLI, no caching).
- **`StrykerConfig`** (internal interface) — Narrows the parsed JSON to just the `mutate: string[]` field.

## Relationships

- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT` to anchor all file-system reads and path computations.
- **`scripts/mutation/run-diff.ts`** — Calls `isMutable` (or `changedMutable`) to intersect a git diff against the mutable scope before spawning Stryker on the subset.
- **`scripts/mutation/run-shards.ts`** — Consumes the `{ file, lines }[]` array produced by `scopeWithLines()` to split work into balanced shards.
- **`scripts/mutation/ci/cli.ts`** — Orchestrates the CI entrypoint; relies on this module's exports to determine what to run and how to partition it.
- **`tests/unit/scripts/mutation/mutate-scope.test.ts`** — Unit-tests `isMutable`, `mutableFiles`, `lineCount`, `scopeWithLines`, and `changedMutable` with injected pattern arrays.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Tests wave/sharding logic that builds on the scope this module provides.

## Notes

- Paths are always repo-root-relative and POSIX-separated (`/`), even on Windows; `mutableFiles` explicitly converts `path.sep`.
- `changedMutable` is intentionally pure (two arrays in, array out) so it can be tested without mocking the filesystem and so a file deleted after a branch point silently drops out (it won't appear in `mutableFiles()`).
- The `minimatch` include-then-exclude logic mirrors Stryker's documented resolution order (includes applied first, `!` exclusions applied after), ensuring this script's scope matches what Stryker itself would mutate.
- `stryker.json` is re-read on every call to `mutatePatterns()`; there is no caching. This is fine because the consumer is a short-lived CLI, but it means the function is not idempotent if the file changes mid-process (unlikely in practice).
