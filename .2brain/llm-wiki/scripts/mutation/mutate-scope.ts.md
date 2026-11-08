---
source: scripts/mutation/mutate-scope.ts
sha256: 008a436eb79517dc84053ae0a2b55e7b7e8b27f47b6a7fe623eefa6968264dd3
generated_at: 2026-11-08T02:53:50.042402+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/mutate-scope.ts

## Purpose

Resolves the mutation-testing scope by reading `stryker.json`'s own `mutate` globs at call time, then exposes the resulting file list, per-file line counts, and a membership predicate. It exists so that shard sizing, diff filtering, and CI wave planning all agree on *which* files Stryker will actually touch, without hand-mirroring a module list that drifts the moment a new module lands.

## Key elements

- **`isMutable(file, patterns?)`** — Returns whether a repo-root-relative POSIX path falls inside Stryker's mutate scope. Splits patterns into include (plain) and exclude (`!`-prefixed) groups, then applies `minimatch` so the result matches Stryker's own resolution.
- **`mutableFiles()`** — Walks `src/` under `REPO_ROOT`, collects every `.ts` file, and filters through `isMutable`. Returns repo-root-relative POSIX paths.
- **`lineCount(file)`** — Counts non-blank lines in a file (close enough to Stryker's mutable-line notion for shard sizing).
- **`scopeWithLines()`** — Combines the two above into an array of `{ file, lines }` objects, the shape `packIntoShards` expects.
- **`changedMutable(changed, mutable)`** — Pure set-intersection of a diff's touched files against the mutable scope. No filesystem or git calls; kept side-effect-free for testability.
- **`mutatePatterns()`** *(internal)* — Reads `stryker.json` fresh on every call; this is a short-lived CLI, not a server, so caching is unnecessary.

## Relationships

- **`scripts/modules-on-disk.ts`** — Supplies the `REPO_ROOT` constant used for all path resolution in this file.
- **`scripts/mutation/run-diff.ts`** — Consumes `changedMutable` (and implicitly `mutableFiles` / `isMutable`) to intersect a git diff with the mutate scope, keeping its own entrypoint a thin wrapper.
- **`scripts/mutation/run-shards.ts`** — Consumes `scopeWithLines` as the `{ file, lines }[]` input to `packIntoShards`.
- **`scripts/mutation/ci/cli.ts`** — Upstream caller in the CI pipeline that triggers scope-based shard/wave planning.
- **`tests/unit/scripts/mutation/mutate-scope.test.ts`** — Unit tests for `isMutable`, `changedMutable`, and the glob-resolution logic; passes its own `patterns` array to avoid filesystem coupling.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Exercises wave-partitioning logic that depends on the scope this module defines.

## Notes

- `mutatePatterns()` re-reads `stryker.json` on every invocation. This is intentional (CLI lifecycle) but means repeated calls in a tight loop will hit disk each time.
- `isMutable` defaults its `patterns` argument to `mutatePatterns()`. Callers that already hold a pattern list (e.g. a test) should pass it explicitly to avoid the file read.
- `changedMutable` does **not** re-apply globs. It trusts that the `mutable` argument already came from `mutableFiles()`. Passing an arbitrary list will skip the glob check.
- `lineCount` counts non-blank lines, not Stryker's exact mutable-line count. The module docstring calls this "close enough" for shard sizing; do not use it as an exact mutation-site count.
