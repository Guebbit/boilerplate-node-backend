---
source: scripts/audit/check-clean.ts
sha256: 27df448d0b8b16a694e7dd9f288318336c0e10da76033d9c0e4adf978f147348
generated_at: 2026-11-14T17:20:04.802134+00:00
model: ollama:qwen3.8:27b
---

# scripts/audit/check-clean.ts

## Purpose

Implements the audit tripwire (rule 6 in `scripts/audit/RULES.md`): verifies that an audit run wrote nothing outside its own report folder. It does this by capturing a git-state snapshot before and after the run, then diffing the two while ignoring changes inside the run folder. Exits 0 when clean, 1 when changes are detected, 2 on bad usage.

## Key elements

- **`RepoSnapshot`** (type) — a `Record` with five keys (`head`, `refs`, `stash`, `status`, `index`), each holding the non-empty output lines of the corresponding `git` command.
- **`VIEWS`** (constant) — maps each `RepoSnapshot` key to the `git` sub-arguments used to capture it (e.g. `status` → `['status', '--porcelain=v2', '--ignored']`).
- **`git(repo, args)`** (internal) — thin wrapper around `execFileSync('git', …)` that sets `GIT_OPTIONAL_LOCKS=0` (prevents `git status` from taking the index lock) and merges in `gitEnvironment()`.
- **`snapshotRepo(repo)`** (exported) — calls `git` for every view and returns a `RepoSnapshot`.
- **`diffSnapshots(before, after, folder)`** (exported) — set-diffs each view between two snapshots, filters out lines inside the run folder, and returns `± view: line` strings.
- **`main(argv)`** (exported) — CLI entry point. Accepts `snapshot <run-folder> [--repo …]` (writes JSON snapshots into the run folder) or `compare <run-folder> [--repo …]` (re-reads snapshots, takes a fresh snapshot, prints diffs). Returns the exit code.
- **`parseArguments`, `repoRoot`, `snapshotFile`, `isInsideRunFolder`** — internal helpers for CLI parsing, resolving the repo top-level, naming snapshot files (`.tripwire.<basename>.json`), and excluding run-folder noise.

## Relationships

- **`scripts/git-base.ts`** — imports `gitEnvironment()` to build a safe env for `execFileSync` calls.
- **`scripts/audit/run-check-clean.ts`** — the thin CLI wrapper that imports `main` from this module and delegates execution to it. This module is kept separate so it can be imported in tests without side effects.
- **`tests/unit/scripts/audit/check-clean.test.ts`** — unit-tests the exported functions (`snapshotRepo`, `diffSnapshots`, `main`) in isolation.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — exercises CI wave definitions that reference this module's exit-code contract (0 / 1 / 2).

## Notes

- `GIT_OPTIONAL_LOCKS=0` is critical: without it, `git status` would write to the index, which the tripwire itself would flag as a change.
- The `--ignored` flag on `git status` means a single ignored directory is one line; changes *inside* that directory are invisible to the diff. The `index` view (`git ls-files -s`) partially compensates by showing staged object hashes.
- Snapshot files are stored *inside* the run folder (`.tripwire.<repo-basename>.json`), so they are filtered out by `isInsideRunFolder` during the compare step.
- `main` is exported (not self-invoking) specifically so the unit test can call it with controlled `argv` without spawning a real process.
