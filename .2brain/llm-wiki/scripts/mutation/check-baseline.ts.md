---
source: scripts/mutation/check-baseline.ts
sha256: c9c16a1b700dee304b7fa79f80cd74143f48668124e1da8610feff5d14ccc850
generated_at: 2026-10-15T09:42:24.699837+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/check-baseline.ts

## Purpose

CLI entry point for the per-file mutation ratchet. It compares the scores from the last Stryker run (read from `tmp/reports/mutation/mutation.json` or a sharded directory) against `mutation-baseline.json`, optionally recording new or improved scores. It deliberately does **not** run Stryker itself, so the check is cheap enough to run in a separate CI step from the actual mutation pass.

## Key elements

- **Flag parsing** — reads `--update`, `--merge`, and `--merge-dir=<path>` from `process.argv` (via `flagValue` from `../cli`).
- **Report loading** — calls `readReport()` for a single run or `readReportsUnder(mergeDirectory)` for a sharded sweep.
- **First-baseline guard** — if no baseline exists, a bare check is a no-op (exit 0); only `--update` or `--merge` will write one.
- **Partial-report guard** (`--update` path) — `missingFromReport` detects files the baseline knows that the report omits; if present, the update is refused (exit 1) to prevent silently dropping files from the ratchet.
- **`--merge` path** — uses `compareMerged` / `mergeIntoBaseline`; records new and improved files, leaves files no shard measured untouched, still fails on regressions.
- **Single-run path** — uses `compareToBaseline`; prints per-file verdicts (held / improved / new / removed / regressed), fails on any regression.
- **Ratchet write** — `nextBaseline(current, baseline)` takes the *higher* of current vs. baseline per file, so a regressed file keeps its old (higher) score and keeps failing until genuinely fixed.
- **Exit codes** — `0` pass, `1` regression (or partial-report refusal), `2` usage / missing report.

## Relationships

- **`scripts/mutation/baseline.ts`** — supplies every piece of domain logic: baseline read/write, report reading, comparison (`compareToBaseline`, `compareMerged`), the partial-report guard (`missingFromReport`), ratchet scoring (`nextBaseline`), merge (`mergeIntoBaseline`), regression formatting (`formatRegressions`), and the `BASELINE_PATH` constant. This file is purely orchestration and console output.
- **`scripts/cli.ts`** — provides the `flagValue` helper used to extract `--merge-dir=<path>` from `process.argv`.

## Notes

- New and improved files are printed **even on a passing run** so the ratchet's movement is visible in CI logs; a silent pass would be indistinguishable from a check that isn't running.
- `tmp/*` (including the report and any locally-created baseline) is gitignored, so a local partial run cannot leak into CI.
- The frontend repository ships a copy of this CLI **without** `--merge` / `--merge-dir`, since it has no sharded sweep.
- On a regressed `--update`, the file is still rewritten (because `nextBaseline` preserves the old higher score), so the next run will still fail until the code is fixed.
