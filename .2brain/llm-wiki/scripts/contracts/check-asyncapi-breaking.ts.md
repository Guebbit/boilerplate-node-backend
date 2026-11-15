---
source: scripts/contracts/check-asyncapi-breaking.ts
sha256: 09dbc0d0fbd2043e8729b57b70bdf28d23a7b4aa0df728ee8392fe8fa9f0d704
generated_at: 2026-11-14T17:23:28.382331+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/check-asyncapi-breaking.ts

## Purpose

A commit/CI gate that fails when `asyncapi.public.yaml` — the partner-facing webhook event catalogue — drops or narrows a channel, event, or field a subscriber already depends on. It compares the working-tree bundle against the bundle rebuilt from the merge-base commit (default `origin/main`), so the diff reflects what this branch actually ships relative to main, not a stale local copy.

## Key elements

- **`BUNDLE`** — constant naming the single file this gate protects: `asyncapi.public.yaml`.
- **`base`** — the comparison ref, read from `--base` CLI flag or defaulting to `origin/main`.
- **`bundleAt(ref)`** — rebuilds the bundle at a historical commit: extracts the tree via `git archive` into a temp dir, symlinks `node_modules`, runs the base's own `build-bundles.ts` (scoped to `asyncapi-public`), and reads the resulting YAML. Returns `undefined` on non-timeout failure (interpreted as "file didn't exist yet").
- **`describe(change)`** — formats a single `DiffOutputItem` as `path  (action): before -> after` for readable CLI output.
- **`majorVersion(version)`** — extracts the leading segment of an AsyncAPI version string.
- **Main flow** — resolves `baseCommit` via `mergeBase`, reads before/after YAML, short-circuits on missing/identical files, parses both with `@asyncapi/parser`, skips diff on cross-major-version change, then calls `breakingChanges` and exits 1 with details if any are found.

## Relationships

- **`scripts/contracts/asyncapi-breaking.ts`** — provides `breakingChanges(beforeJson, afterJson)` which performs the actual structural diff and returns the list of breaking `DiffOutputItem`s. This script is its primary caller.
- **`scripts/contracts/run-with-timeout.ts`** — provides `runWithTimeout` (used to spawn `git`, `tar`, `npx` with a hard timeout) and `CommandTimeoutError` (re-thrown to fail the gate loudly rather than silently passing).
- **`scripts/git-base.ts`** — provides `mergeBase(base, branch)` which yields the exact commit to compare against.
- **`scripts/modules-on-disk.ts`** — provides `REPO_ROOT` so the script can locate `node_modules` and the working-tree bundle regardless of CWD.
- **`scripts/cli.ts`** — provides `flagValue('base')` for parsing the `--base` CLI argument.

## Notes

- The bundle is **not committed** to git; there is no `git show` shortcut. The base copy must be rebuilt from source, which is why `bundleAt` extracts a full tree and re-runs the bundler.
- `node_modules` is **symlinked** into the scratch tree rather than installed — the bundle step needs no generated files.
- A `CommandTimeoutError` inside `bundleAt` is **re-thrown** (gate fails); any other error returns `undefined` (gate passes, assuming the file didn't exist yet). This asymmetry is deliberate: a hung child must not masquerade as "nothing to compare."
- Cross-**major** AsyncAPI version changes are intentionally allowed through (a major bump *is* the deliberate break); the gate only catches same-major regressions.
- `/info/version` differences are ignored by `asyncapi-breaking.ts`, not by this file.
- Exit codes: `0` pass, `1` breaking changes found, `2` parse/runtime error.
