---
source: scripts/hooks/stale-generated-files.ts
generated_at: 2026-11-22T02:07:12.449696+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/hooks/stale-generated-files.ts

## Purpose
Determines which committed files a regeneration would change. It is the core of the pre-commit hook's "refuse a stale generated file" check. It works from what is being committed rather than the working tree. The git index is exported to a scratch folder and regenerated there, and the result is compared with itself. An unsaved edit or an unstaged regenerated file on disk therefore can't make a stale commit look fresh. The module doc says the approach has the same shape as Kubernetes' `verify-generated.sh`.

## Key elements
- `StaleGeneratedOptions` is the input interface:
  - `repo`: the checkout whose index is being committed.
  - `regenerate(tree)`: regenerates every artifact inside the scratch copy. It owns that copy's environment (linked `node_modules`, the command to run) and throws on failure.
  - `indexEnvironment?`: the environment used for the index export. It defaults to `process.env`, so git's own `GIT_INDEX_FILE` is kept and a partial `git commit -- <paths>` exports its temporary index. Tests pass a clean one.
- `staleGeneratedFiles(options)` is the single export. It returns repo-relative paths, or an empty array when everything is current. Its steps are:
  1. Create a temp dir (`verify-generated-*`).
  2. Run `git checkout-index --all --prefix=<scratch>/` in the repo, using the index environment.
  3. Run `git init`, then `git add --all`, in the scratch dir. This gives the export its own index, and steps that call `git ls-files` (the module graph) work there.
  4. Call `options.regenerate(scratch)`.
  5. Return the `git diff --name-only -z` output (files rewritten) followed by `git ls-files --others --exclude-standard -z` (new files not covered by a `.gitignore`, which should have been committed).
  6. Always delete the scratch dir in `finally`.
- `git` and `paths` are internal helpers. `git` runs a git command via `execFileSync` and returns stdout. `paths` splits NUL-terminated `-z` output into a list.

## Relationships
- `scripts/git-base.ts`: supplies `gitEnvironment()`. Its result is used as the clean environment for all git commands inside the scratch repo.
- `scripts/hooks/check-generated-fresh.ts`: the hook that consumes this module (per the module doc). It supplies `regenerate` and decides what to do with the stale paths.
- `tests/unit/scripts/hooks/stale-generated-files.test.ts`: unit tests for this module. Per the `indexEnvironment` docs, they pass a clean environment.

## Notes
- The `--prefix` value needs its trailing slash.
- Errors are not swallowed. A failing `regenerate` or git command throws, and the scratch dir is still removed.
- The scratch folder is created under `os.tmpdir()`.
- Only the `git init` and later steps use the clean environment. The index export deliberately uses `indexEnvironment`.
