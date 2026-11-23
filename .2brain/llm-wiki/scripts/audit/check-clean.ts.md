---
source: scripts/audit/check-clean.ts
source_sha256: 24ec07c4cfd55a103864c1498cd49881d516b064f6554f06a271189dbeb5e28f
context_sha256: 32047144cc10e9262d820e113cc5cb491cbafd6c82c77997540b0fc689c4eeff
generated_at: 2026-11-22T01:51:24.802205+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/audit/check-clean.ts

## Purpose
Implements the audit "tripwire" (rule 6 of the audit rules). It snapshots the git state of one or more repos before an audit and compares it afterwards, reporting anything that changed outside the audit's own run folder. It is kept separate from the CLI wrapper `run-check-clean.ts` so its unit test can import it without executing it.

## Key elements
- `RepoSnapshot`: type with five string-array keys (`head`, `refs`, `stash`, `status`, `index`), one entry per output line of a git view.
- `VIEWS` (internal): the `git` arguments for each view: `rev-parse HEAD`, `for-each-ref`, `stash list`, `status --porcelain=v2 --ignored`, `ls-files -s`.
- `git` (internal): runs git via `execFileSync` in a repo, with a 256 MiB output buffer and `GIT_OPTIONAL_LOCKS=0` so it takes no index lock. Returns the non-empty lines.
- `snapshotRepo(repo)`: records all five views.
- `diffSnapshots(before, after, folder)`: returns `- view: line` / `+ view: line` strings for lines present in only one snapshot. Rows that refer to the run folder are dropped.
- `isInsideRunFolder` (internal): takes the last space-separated token of a row as a path and treats it as inside if it equals the run folder, is a parent of it, or is below it.
- `repoRoot`, `snapshotFile` (internal): resolve the repo top level. The snapshot is stored at `<runFolder>/.tripwire.<repo-basename>.json`.
- `parseArguments` (internal): reads `mode`, `runFolder` and any `--repo <path>` options. The current directory `.` is always included as a repo.
- `main(argv)`: entry point that returns the exit code.
  - `snapshot` mode creates the run folder, writes one JSON snapshot per repo, and prints `Tripwire: snapshot taken` (exit 0).
  - `compare` mode loads each snapshot, diffs it against the current state, and prints `Tripwire: clean` (exit 0) or `Tripwire: CHANGED:` followed by the differences (exit 1).
  - A missing or invalid mode or run folder prints a usage message (exit 2).
  - A missing snapshot is reported as a change.

## Relationships
- `run-check-clean.ts` is the runnable entry point. It calls `main` and holds the usage and exit-code documentation.
- `scripts/git-base.ts` provides `gitEnvironment()`, whose environment is merged with `GIT_OPTIONAL_LOCKS=0` for every git call.
- `tests/unit/scripts/audit/check-clean.test.ts` unit-tests this module's exports.
- `tests/unit/scripts/mutation/ci/waves.test.ts` is related through the dependency graph. Nothing in this file shows how it uses it.

## Notes
- `status --ignored` reports an ignored folder as a single entry, so changes inside an ignored folder are not detected.
- `ls-files -s` includes object hashes, so re-staging an edited file is detected.
- `isInsideRunFolder` splits on spaces and takes the last token, so a path containing spaces is only matched by its final segment.
- The run folder must differ from the current directory, otherwise the usage error is returned.
- Snapshot file names depend on the repo directory's basename, so two repos with the same basename would share a snapshot file.
