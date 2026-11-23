---
source: scripts/mutation/mutate-scope.ts
generated_at: 2026-11-22T02:09:37.887641+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/mutation/mutate-scope.ts

## Purpose
Computes the mutation-testing scope by reading the `mutate` globs directly from `stryker.json`, rather than mirroring the module list by hand. A hand-copied list drifts when modules are added (the header notes `src/infrastructure`, `src/kernel`, `webhooks`, `api-keys` and `antibot` went unmeasured for a month this way). It provides the file list, the line counts used to size shards, and helpers for filtering a diff down to mutable files.

## Key elements
- `isMutable(file, patterns?)` — gitignore-style check using `minimatch`: a path is mutable if it matches any plain pattern and no `!`-prefixed pattern. `patterns` defaults to `stryker.json`'s `mutate`; a test can supply its own.
- `mutableFiles()` — walks `src/` recursively, collects every `.ts` file, converts it to a repo-root-relative POSIX path, and keeps those that pass `isMutable`.
- `lineCount(file)` — number of non-blank lines in a file; an approximation of Stryker's mutable lines, used for shard sizing.
- `scopeWithLines()` — `mutableFiles()` mapped to `{ file, lines }`, the shape `packIntoShards` expects.
- `changedMutable(changed, mutable)` — pure set intersection of a diff's changed files with the mutable list. It does no git or filesystem access.
- `mutatePatterns()` (private) — reads and parses `stryker.json` on each call, with no caching.

## Relationships
- Imports `REPO_ROOT` from `scripts/modules-on-disk.ts` to resolve `stryker.json` and `src/`.
- `scripts/mutation/run-diff.ts` uses it for the changed-files diff. `isMutable` and `changedMutable` let that entrypoint stay a thin wrapper.
- `scripts/mutation/run-shards.ts` and `scripts/mutation/ci/cli.ts` are graph neighbors. The shard-sizing exports (`scopeWithLines`, `lineCount`) are presumably consumed there, though the file itself does not show its callers.
- Tested by `tests/unit/scripts/mutation/mutate-scope.test.ts`. `tests/unit/scripts/mutation/ci/waves.test.ts` is also a graph neighbor.

## Notes
- Only `.ts` files under `src/` are walked. A pattern in `stryker.json` that covers files elsewhere would not appear in `mutableFiles()`.
- `stryker.json` is read at runtime as the source of truth for the scope (it is not a graph neighbor, just a data file this module reads).
- `changedMutable` deliberately does not re-apply the globs to the diff. It intersects with `mutableFiles()`, which has already applied them to the tree, so there is no second glob evaluation to drift. A file the diff names but the branch later deleted drops out without an explicit existence check.
- `stryker.json` is read fresh on every call, which is fine for a short-lived CLI. `mutableFiles()` reads it once and passes the patterns to `isMutable`, so the file is not re-read per file.
- Paths must be repo-root-relative and use `/` separators. `mutableFiles()` normalises `path.sep` to `/`.
