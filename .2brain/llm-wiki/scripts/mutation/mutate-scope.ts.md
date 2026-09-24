---
source: scripts/mutation/mutate-scope.ts
sha256: 616d542cd92feccfee60d3c69466d5638d88a45b60a3c2efb9f64144c9ab2582
generated_at: 2026-09-23T17:28:26.021199+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/mutate-scope.ts

## Purpose

Resolves Stryker's mutation scope directly from `stryker.json`'s `mutate` globs, producing the list of in-scope `.ts` files (with line counts for shard sizing) and a pure `isMutable` predicate for callers that already have their own file list. Exists so the scope is read from the single source of truth rather than hand-mirrored, which previously let five modules go unmeasured for a month.

## Key elements

- **`isMutable(file, patterns?)`** — Gitignore-style include/exclude check using `minimatch` (Stryker's own matcher). Splits `!`-prefixed patterns into excludes; a file is mutable if it matches ≥1 include and 0 excludes. Patterns default to a fresh read of `stryker.json`.
- **`mutableFiles()`** — Walks `src/` recursively, collects all `.ts` files, normalizes to repo-root-relative POSIX paths, and filters through `isMutable`.
- **`lineCount(file)`** — Counts non-blank lines in a single file (approximates Stryker's mutable-line count for shard sizing).
- **`scopeWithLines()`** — Returns `{ file, lines }[]` — the shape `packIntoShards` expects.
- **`changedMutable(changed, mutable)`** — Pure set-intersection: keeps only entries in `changed` that also appear in `mutable`. No git, no filesystem, no glob re-evaluation.

## Relationships

- **`scripts/mutation/run-diff.ts`** — Consumes `changedMutable` as a thin entrypoint wrapper; passes its own diff output and `mutableFiles()` into the pure intersection.
- **`scripts/mutation/run-shards.ts`** — Consumes `scopeWithLines()` as the per-file line-count input for shard packing.
- **`scripts/mutation/shard-plan.ts`** — Defines the `{ file, lines }` shape that `scopeWithLines()` produces for `packIntoShards`.
- **`tests/unit/scripts/mutation/mutate-scope.test.ts`** — Unit-tests this module, supplying its own `patterns` array to `isMutable` and its own arrays to `changedMutable`.

## Notes

- Repo root is derived from `__dirname` (`path.join(__dirname, '..', '..')`), never the caller's cwd — safe from any working directory.
- `mutatePatterns()` re-reads `stryker.json` on every call; this is intentional (short-lived CLI, not a long-lived server) and means the config is never cached.
- `mutableFiles()` only walks `src/`; a mutable file outside that tree (if `stryker.json` ever globs elsewhere) will be silently omitted.
- `changedMutable` is deliberately _not_ re-applying globs to the diff. It relies on `mutableFiles()` already having walked the tree Stryker sees, so a file deleted on the branch drops out for free (absent from the walk → absent from the intersection).
- The `minimatch` import is used to match paths exactly as Stryker does; swapping it for a different glob library could produce scope disagreements with Stryker.
