# scripts/check-mutation-baseline.ts

## Purpose

CLI entry point for the per-file mutation ratchet. It reads the Stryker report (`reports/mutation/mutation.json`), compares per-file scores against a committed JSON baseline, and either fails the process (exit 1) if any file regressed or records a new baseline. It deliberately does **not** invoke Stryker, keeping the gate cheap enough to run in a separate CI step from the actual mutation run.

## Key elements

- **`--update` flag** (detected via `process.argv`) — switches the script from "check only" to "check and rewrite the baseline."
- **`profileFromArguments` / `MUTATION_PROFILES`** — selects a named profile (default vs. `--deep`), each with its own report path and committed baseline file, so scores are only compared against measurements taken the same way.
- **`readReport(profile)`** — parses the Stryker JSON report for the selected profile; a missing/invalid report exits 2.
- **`readBaseline(profile)`** — loads the committed baseline; returns `null` on first-ever run, in which case the script writes the report as the initial baseline and exits 0.
- **`missingFromReport(current, baseline)`** — detects files present in the baseline but absent from the report, guarding against a partial Stryker run silently erasing ratchet memory on `--update`.
- **`compareToBaseline(current, baseline)`** — returns per-file verdicts: `held`, `improved`, `new`, `removed`, or regressed.
- **`nextBaseline(current, baseline)`** — merges the two, keeping the *higher* score per file (the ratchet: scores only ever go up).
- **`writeBaseline(next, profile)`** — persists the merged baseline.
- **`formatRegressions(comparisons)`** — produces a human-readable block of regressed files for `console.error`.
- **Exit codes** — 0: all fine; 1: one or more files regressed (or partial-report guard fired); 2: report file could not be read.

## Relationships

- **`scripts/mutation-baseline.ts`** — provides every imported function and constant (`compareToBaseline`, `missingFromReport`, `formatRegressions`, `nextBaseline`, `readBaseline`, `readReport`, `writeBaseline`, `MUTATION_PROFILES`, `profileFromArguments`). This file is the CLI shell; all comparison, I/O, and merging logic lives in that module.

## Notes

- The ratchet is **monotonic per file**: `nextBaseline` takes `max(current, baseline)` per file, so a regressed file keeps its old (higher) baseline and continues to fail until the code is actually fixed.
- New and improved files are printed even when the overall result is a pass — an intentional design so a silent exit 0 isn't indistinguishable from a broken/no-op check.
- The `--deep` profile exists because integration tests under `tests/integration/` are only mutated in that scope; it has a separate report and baseline so scores remain comparable.
- Running `--update` when the report is a subset of the baseline (e.g. a targeted `--mutate 'some/file.ts'` run) is **refused** with exit 1; the user must run a full mutation pass or explicitly delete the baseline first.
