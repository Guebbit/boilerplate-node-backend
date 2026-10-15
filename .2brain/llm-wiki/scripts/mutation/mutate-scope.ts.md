---
source: scripts/mutation/mutate-scope.ts
sha256: 008a436eb79517dc84053ae0a2b55e7b7e8b27f47b6a7fe623eefa6968264dd3
generated_at: 2026-10-15T09:42:52.814284+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/mutate-scope.ts

## Purpose

Defines the mutation-testing scope by reading Stryker's own `mutate` globs from `stryker.json`, then exposes the resulting file list, per-file line counts, and a membership check. It exists as a single source of truth so that sharding, diff filtering, and CI wave logic all agree on *which* files Stryker will actually touch, without any hand-maintained module list that drifts when a module is added.

## Key elements

- **`isMutable(file, patterns?)`** — Returns whether a repo-root-relative POSIX path falls inside Stryker's mutate scope (matches at least one include pattern and no `!`-prefixed exclude pattern). Accepts an optional `patterns` array so tests can inject their own globs.
- **`mutableFiles()`** — Recursively walks `src/`, collects all `.ts` files, and filters them through `isMutable`. Returns repo-root-relative, POSIX-separated paths.
- **`lineCount(file)`** — Counts non-blank lines in a file (an approximation of Stryker's mutable-line count, used to size shards).
- **`scopeWithLines()`** — Combines `mutableFiles()` + `lineCount()` into the `{ file, lines }[]` shape that `packIntoShards` consumes.
- **`changedMutable(changed, mutable)`** — Pure set-intersection: keeps only those files from `changed` that appear in `mutable`. No filesystem or git access, so `run-diff.ts` can stay a thin wrapper and tests can drive it with plain arrays.
- **`mutatePatterns()`** *(internal)* — Reads `stryker.json` fresh on every call and returns the `mutate` string array.

## Relationships

- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT` for all path resolution.
- **`scripts/mutation/ci/cli.ts`** — CI entrypoint that consumes the scope (via `scopeWithLines` or `mutableFiles`) to plan mutation waves.
- **`scripts/mutation/run-diff.ts`** — Calls `changedMutable(changedFiles, mutableFiles())` to filter a git diff down to the mutable subset.
- **`scripts/mutation/run-shards.ts`** — Consumes the `{ file, lines }[]` shape produced by `scopeWithLines()` to pack work into balanced shards.
- **`tests/unit/scripts/mutation/mutate-scope.test.ts`** — Unit-tests `isMutable` (with injected patterns), `changedMutable`, and the scope/line-count helpers.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Exercises scope logic in the context of CI wave construction.

## Notes

- `stryker.json` is re-read on **every** call to `mutatePatterns()`; there is no caching. This is intentional — the scripts are short-lived CLI invocations, not long-running servers.
- `isMutable` uses `minimatch` (Stryker's own glob engine) with the same include-then-exclude semantics Stryker applies, so a path this module calls mutable is one Stryker agrees is mutable.
- `mutableFiles()` only walks `src/`; files outside that tree are never considered, regardless of what the globs would match.
- `lineCount` counts non-blank lines as a proxy for Stryker's "mutable lines." It is intentionally approximate — good enough for shard sizing, not a precise Stryker metric.
- `changedMutable` is deliberately pure (no `fs`, no `git`). A file that appeared in the diff but was deleted before the walk simply won't be in `mutableFiles()`, so it drops out of the intersection with no extra existence check.
