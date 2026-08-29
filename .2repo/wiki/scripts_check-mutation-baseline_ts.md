# scripts/check-mutation-baseline.ts

## Purpose

CLI entry point for the per-file mutation ratchet. Reads the latest Stryker mutation report (`reports/mutation/mutation.json`), compares it against `mutation-baseline.json`, reports regressions, and optionally records improvements. It is deliberately separate from running Stryker so a CI job can split the expensive test run and the cheap gate into independent steps.

## Key elements

- **`--update` flag** (detected via `process.argv.includes`) — toggles between read-only check mode and baseline-recording mode.
- **Read path** — calls `readReport()` and `readBaseline()` from the module; on first run (no baseline) it records the current report as the initial baseline and exits 0.
- **Partial-report guard** — before any write with `--update`, `missingFromReport()` verifies the report covers every file the baseline already knows about; if not, the script refuses to update and exits 1 to prevent silently erasing ratchet memory.
- **Verdict summary** — tallies `held`, `improved`, `regressed`, `added`, and `removed` counts from `compareToBaseline()`.
- **Progress output** — prints every new file (with score), every improvement (before → after), and every removed file, even on a passing run, so a silent pass is distinguishable from a non-running check.
- **Regression handling** — on regression, prints `formatRegressions()` output and exits 1. With `--update`, still calls `writeBaseline(nextBaseline(current, baseline))` but `nextBaseline` never lowers a score, so the ratchet holds.

## Relationships

- **`scripts/mutation-baseline.ts`** — sole dependency. All domain logic (read/write baseline, read report, comparison, formatting, partial-report detection, `MUTATION_BASELINE_PATH`) lives there. This file is purely the CLI wiring, exit-code control, and console output.

## Notes

- **Exit codes:** `0` = pass (or first-baseline recording), `1` = regression detected or partial-report guard tripped, `2` = no mutation report file found.
- **Ratchet is one-way:** `nextBaseline` (in the module) only ever takes `max(baseline, current)` per file, so a score can never decrease in the recorded baseline regardless of `--update`.
- **Does not invoke Stryker.** Run `npm run test:mutation` first; this script only reads the JSON artifact it produces.
- **Shebang is `#!/usr/bin/env tsx`** — executed directly as a script, not compiled to JS first.
