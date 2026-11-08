---
source: scripts/hooks/stale-generated-files.ts
sha256: 29efc5f530694d644e283cdcef906d69198d02f5b40dd6067c53c1fe7bfee6d4
generated_at: 2026-11-08T02:51:45.497566+00:00
model: ollama:qwen3.8:27b
---

# scripts/hooks/stale-generated-files.ts

## Purpose

Identifies which files a full regeneration would modify, starting exclusively from the **staged index** (not the working tree). The pre-commit hook uses this to refuse commits that contain stale generated artifacts. The approach mirrors Kubernetes' `verify-generated.sh`: export the index to a scratch directory, regenerate in that copy, and diff.

## Key elements

- **`StaleGeneratedOptions`** — interface describing what the check needs: the repo path, a `regenerate` callback that owns the scratch copy's environment, and an optional `indexEnvironment` override (e.g. to preserve `GIT_INDEX_FILE` during a partial `git commit -- <paths>`).
- **`staleGeneratedFiles(options): string[]`** — exported entry point. Exports the index via `checkout-index --prefix`, inits a throwaway git repo in the scratch dir, calls `regenerate`, then returns repo-relative paths that were rewritten (`git diff --name-only`) or newly added (`git ls-files --others --exclude-standard`). Returns an empty array when everything is current. Cleans up the scratch dir in a `finally` block.
- **`git(directory, args, env)`** (internal) — thin wrapper around `execFileSync('git', …)` returning stdout as a UTF-8 string.
- **`paths(output)`** (internal) — splits NUL-delimited `-z` output into a path array.

## Relationships

- **`scripts/git-base.ts`** — imports `gitEnvironment` to obtain a clean environment (no inherited `GIT_*` variables) for the scratch-repo git commands.
- **`scripts/hooks/check-generated-fresh.ts`** — the direct consumer; this module is the core logic behind that hook's "refuse a stale generated file" check.
- **`tests/unit/scripts/hooks/stale-generated-files.test.ts`** — unit tests that exercise `staleGeneratedFiles` by supplying a mock `regenerate` and `indexEnvironment`.

## Notes

- `checkout-index --all --prefix=<dir>/` requires the trailing slash; without it git errors.
- The scratch directory is a brand-new `git init` so that `git diff` and `git ls-files` have an index to work against. This also means the module graph (anything that shells out to `git ls-files`) can resolve inside the scratch copy.
- The check is immune to unsaved peer edits or un-staged regenerations on disk because it operates solely on the exported index.
- The `indexEnvironment` option exists specifically so that a partial `git commit -- <paths>` (which sets `GIT_INDEX_FILE` to a temporary index) still exports the correct subset; tests pass a clean env instead.
- Scratch directory cleanup uses `rmSync(…, { recursive: true, force: true })` in `finally`, so it runs even if `regenerate` throws.
