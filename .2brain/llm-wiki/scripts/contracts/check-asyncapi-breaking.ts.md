---
source: scripts/contracts/check-asyncapi-breaking.ts
sha256: ae305fd0194a0ec53a4b32e2b629244e5a3c01cfa8d5ab385d460021714e7c01
generated_at: 2026-11-08T02:40:08.977538+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/check-asyncapi-breaking.ts

## Purpose

CI gate that fails a commit when `asyncapi.public.yaml` (the partner-facing webhook event catalogue) drops or narrows a shape a subscriber already depends on. It compares the working-tree bundle against the bundle rebuilt from the merge-base of the branch, so the comparison reflects "what would this change actually ship" rather than a stale local `main`. Invoked via `npm run check` or `npx tsx scripts/contracts/check-asyncapi-breaking.ts --base=HEAD~3`.

## Key elements

- **`BUNDLE`** — constant `'asyncapi.public.yaml'`; the only file this gate inspects.
- **`base`** — resolved from `--base` flag (via `flagValue`) or defaults to `'origin/main'`.
- **`bundleAt(ref)`** — exports the tree at `ref` with `git archive`, symlinks `node_modules`, runs the project's own `build-bundles.ts` narrowed to `asyncapi-public`, and returns the built YAML text (or `undefined` on failure).
- **`describe(change)`** — formats a single `DiffOutputItem` as `path  (action): before -> after` for human-readable output.
- **`majorVersion(version)`** — extracts the leading segment of an AsyncAPI semver string.
- **`baseCommit`** — result of `mergeBase(base, 'asyncapi-breaking')`; `undefined` means "no comparison possible → pass".
- **Main flow** — reads `before` (built at `baseCommit`) and `after` (read from disk), short-circuits on identity or missing `before`, parses both with `@asyncapi/parser`, skips if major version changed, otherwise calls `breakingChanges()` and exits 1 with a per-change listing if any are found.

## Relationships

- **`scripts/cli.ts`** — imports `flagValue` to read the optional `--base` CLI argument.
- **`scripts/contracts/asyncapi-breaking.ts`** — imports `breakingChanges`, the function that performs the structural diff and returns the array of `DiffOutputItem`s (also ignores `/info/version`).
- **`scripts/git-base.ts`** — imports `mergeBase` to resolve the common ancestor commit.
- **`scripts/modules-on-disk.ts`** — imports `REPO_ROOT` for constructing absolute filesystem paths (scratch dirs, `node_modules` symlink, reading the on-disk bundle).

## Notes

- The bundle is **not committed**; both sides of the comparison are built on the fly. The base side is built in a `mkdtemp` scratch folder that is cleaned up in `finally`.
- `node_modules` is **symlinked** into the scratch tree rather than reinstalled — the bundle step is assumed to need no generated artifacts.
- `@asyncapi/diff` requires fully dereferenced documents, so both sides go through `@asyncapi/parser` first (the parser resolves `$ref`s).
- A **major-version bump** is treated as the intentional, reviewed break: the script logs a message and exits 0 rather than attempting a structural diff (which `@asyncapi/diff` would reject with a `TypeError`).
- Exit codes: **0** = pass (unchanged, new file, major bump, no breaking changes); **1** = breaking changes detected; **2** = parse or runtime error.
- The shebang is `#!/usr/bin/env tsx`; the script relies on `tsx` being available in `node_modules/.bin`.
