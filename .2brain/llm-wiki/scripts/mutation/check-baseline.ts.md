---
source: scripts/mutation/check-baseline.ts
sha256: 440123e8e29a940dcab9cda8909b7626fbf25ea2bdbf2f9f9ec92b0faf4d7a51
generated_at: 2026-11-08T02:52:22.198514+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/check-baseline.ts

## Purpose

CLI entry point for the per-file mutation ratchet. It reads a mutation report (or a directory of sharded reports), compares file-level scores against `mutation-baseline.json`, and either gates the run (exit 1 on regression) or records new scores (`--update`) / folds in shard results (`--merge`). It deliberately never invokes Stryker itself, keeping the check cheap enough to run in a separate CI step from the sweep.

## Key elements

- **Argument parsing** — `hasFlag('update')`, `hasFlag('merge')`, `flagValue('merge-dir')` pulled from `../cli` to select one of three modes: plain check, `--update`, or `--merge --merge-dir=<path>`.
- **Report reading** — `readReport()` (single report at `tmp/reports/mutation/mutation.json`) or `readReportsUnder(mergeDirectory)` (all `mutation.json` files under a shard directory), both from `./baseline`.
- **First-baseline guard** — If `mutation-baseline.json` does not yet exist and the invocation is a plain check (no `--update`, no `--merge`), exits 0 with a hint. Prevents a partial local run from silently creating a three-file baseline.
- **`printProgress(comparisons)`** — Local helper that logs "new file recorded" and "improved" lines so a passing run is visibly doing work.
- **`--merge` branch** — Calls `compareMerged`, prints progress, writes via `mergeIntoBaseline`, checks regressions via `formatRegressions`, and exits. The remainder of the file is the single-run path.
- **Partial-report guard** — `missingFromReport(current, baseline)` detects files the baseline knows but the report omits. `--update` with a partial report is refused (exit 1) to protect the ratchet's memory.
- **Single-run comparison** — `compareToBaseline` yields per-file verdicts (`held`, `improved`, `new`, `removed`, `regressed`). Regressions fail (exit 1); a passing `--update` records via `nextBaseline` (which keeps the higher of old/new score per file).
- **Exit codes** — 0 (pass / no baseline yet), 1 (regression or refused update), 2 (usage error: missing report, `--merge` without `--merge-dir`).

## Relationships

- **`scripts/mutation/baseline.ts`** — Supplies every core operation: baseline I/O (`readBaseline`, `writeBaseline`, `BASELINE_PATH`), report I/O (`readReport`, `readReportsUnder`), comparison logic (`compareToBaseline`, `compareMerged`, `missingFromReport`), baseline mutation (`nextBaseline`, `mergeIntoBaseline`), and formatting (`formatRegressions`, `FileComparison`). This file is a thin CLI wrapper over that module.
- **`scripts/cli.ts`** — Provides the generic `hasFlag` / `flagValue` helpers used to parse the process's `--` flags without a full argument-parser dependency.

## Notes

- The frontend repository ships a copy of this CLI **without** the `--merge` code path, since it never runs a sharded sweep.
- `tmp/*` (reports and the baseline file) is gitignored; the baseline only lives locally or in CI ephemeral storage.
- On a regressed `--update`, `nextBaseline` still writes the file but retains the **higher** score per file, so the regressed file stays failing until it is genuinely fixed.
- A plain check against a non-existent baseline is a no-op (exit 0), not an error — the absence is not the current run's fault.
