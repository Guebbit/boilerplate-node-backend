---
source: scripts/mutation/check-baseline.ts
sha256: 440123e8e29a940dcab9cda8909b7626fbf25ea2bdbf2f9f9ec92b0faf4d7a51
generated_at: 2026-10-29T01:38:18.330740+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/check-baseline.ts

## Purpose

CLI entry point for the per-file mutation-testing ratchet. It reads a Stryker `mutation.json` report and compares per-file kill-rates against `mutation-baseline.json`, exiting non-zero on any regression. It can also record a new baseline (`--update`) or fold in a sharded sweep's reports (`--merge --merge-dir=<dir>`). It deliberately does **not** invoke Stryker so the check is cheap and CI can split the run and the gate into separate steps.

## Key elements

- **Flag parsing** — `update`, `merge`, `mergeDirectory` are resolved at module top via `hasFlag`/`flagValue` from `../cli`.
- **`current: Record<string, number>`** — this run's per-file scores, loaded via `readReport()` or `readReportsUnder(mergeDirectory)`.
- **`printProgress(comparisons)`** — logs every `new` and `improved` file; called on every code path so a silent pass is distinguishable from a check that isn't running.
- **First-baseline guard** — if no baseline exists and neither `--update` nor `--merge` was passed, the command is a no-op (exit 0) with a hint to run `npm run mutation:check -- --update`.
- **Partial-report guard** — `missingFromReport` detects files in the baseline absent from the report; `--update` refuses to write in that case (exit 1) to prevent erasing the ratchet's memory.
- **`--merge` path** — calls `compareMerged`, `printProgress`, `mergeIntoBaseline`, then exits; only records new/improved files, leaves unmeasured files untouched.
- **Single-run path** — calls `compareToBaseline`, prints progress + removals, and on regression either exits 1 (bare check) or rewrites the baseline via `nextBaseline` (which keeps the *higher* of old/new score) before exiting 1.
- **Exit codes** — `0` pass/no-baseline, `1` regression, `2` usage error (missing `--merge-dir`, unreadable report).

## Relationships

- **`scripts/mutation/baseline.ts`** — provides all domain logic: `compareToBaseline`, `compareMerged`, `missingFromReport`, `formatRegressions`, `nextBaseline`, `mergeIntoBaseline`, `readBaseline`, `readReport`, `readReportsUnder`, `writeBaseline`, `BASELINE_PATH`, and the `FileComparison` type. This file is purely the CLI layer over those functions.
- **`scripts/cli.ts`** — supplies `hasFlag` and `flagValue` for argument parsing.

## Notes

- `--update` means "this report is the **full** scope"; a partial run (`--mutate 'some/file.ts'`) will be rejected. Sharded sweeps must use `--merge` instead.
- `nextBaseline` is a ratchet: it keeps the maximum of current and baseline per file, so a regressed file retains its old score and stays red until genuinely fixed.
- Progress (new/improved) is printed even when the overall result is a pass, so operators can see the ratchet moving.
- The frontend's copy of this CLI omits the `--merge` path entirely, since the frontend runs no sharded sweep.
- `tmp/reports/mutation/mutation.json` is gitignored; the baseline file it guards against is the only persistent artifact.
