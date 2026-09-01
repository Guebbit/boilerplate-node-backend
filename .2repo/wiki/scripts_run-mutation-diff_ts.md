# scripts/run-mutation-diff.ts

## Purpose

Runs Stryker mutation testing scoped to the files changed in the current branch (default base: `origin/main`), then applies the per-file mutation ratchet. It exists to give reviewers a fast, actionable score for *their* changes rather than a full-repo nightly number.

## Key elements

- **`MUTABLE` / `NOT_MUTABLE`** — Regex filters that restrict mutation targets to production TypeScript under `src/`, excluding specs, type declarations, and `src/types/`.
- **`mergeBase()`** — Resolves `git merge-base HEAD <base>` so a stale local `main` cannot widen the diff. Exits `2` with a CI hint on failure.
- **`changedFiles()`** — Runs `git diff --name-only --diff-filter=ACMR`, applies the above filters, and drops files that no longer exist on disk.
- **Stryker invocation** — `npx stryker run stryker.deep.json --mutate <files> --force`. Mutates whole files (not line ranges) so scores remain comparable to `mutation-baseline-deep.json`.
- **Ratchet invocation** — `npx tsx scripts/check-mutation-baseline.ts --deep`. This is the actual pass/fail verdict; its exit status becomes this script's exit status.

## Relationships

- **`scripts/check-mutation-baseline.ts`** — Invoked as a child process after Stryker completes; its exit code determines the script's exit code.
- **`stryker.deep.json`** — Stryker config consumed by the `stryker run` call.
- **`mutation-baseline-deep.json`** — Read indirectly through the ratchet step; this script never writes to it.

## Notes

- **Never records.** `--update` is intentionally not forwarded to Stryker. Only the nightly run owns the baseline; a partial diff run would erase unmeasured files.
- **Stryker's `thresholds.break` is bypassed.** A non-zero exit from Stryker itself is ignored (only a *spawn error* is fatal). The ratchet is the sole verdict because a percentage over a handful of mutants is noise.
- **Whole-file mutation is deliberate.** A line-range score would be incomparable to the per-file baseline. The trade-off: touching a file means you own its existing debt not getting worse.
- **Early exit.** If no mutable files changed, the script prints a message and exits `0` without invoking Stryker.
- **`--base=` argument.** Parsed from `process.argv`; defaults to `origin/main`. In CI, `fetch-depth: 0` is required for the base ref to resolve.
