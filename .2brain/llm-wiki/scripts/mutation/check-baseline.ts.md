---
source: scripts/mutation/check-baseline.ts
sha256: 5215dfc6b43d2bd6f2e3b3d0217f1cb3d9ba64aa8baa94e7c2bdcce2121d9f86
generated_at: 2026-11-14T17:36:43.433923+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/check-baseline.ts

## Purpose

CLI entry point for the per-file mutation ratchet. It reads a Stryker mutation report (produced by a prior `npm run mutation:full` run), compares each file's survival score against the stored `mutation-baseline.json`, and fails (exit 1) if any file regressed. It never runs Stryker itself, keeping the gate cheap enough for CI to split run and check into separate steps.

## Key elements

- **`printProgress(comparisons, recorded)`** – Logs files that are new (only when a baseline write occurs) and files that improved, so a passing run is visibly distinct from a no-op.
- **Three invocation modes** (mutually exclusive in practice):
  - *Bare check* (`npm run mutation:check`) – compares report to baseline, exits 0 or 1. Writes nothing.
  - `--update` – records the run's scores into the baseline, but only after a partial-report guard passes.
  - `--merge --merge-dir=<dir>` – folds every `mutation.json` under a directory (sharded-sweep reports) into the baseline, leaving files no shard measured untouched.
- **Partial-report guard** (`missingFromReport`) – refuses `--update` when the report covers fewer files than the baseline, preventing a `--mutate 'some/file.ts'` run from silently erasing unmeasured files.
- **Exit codes** – `0` pass, `1` regression (or refused update), `2` usage error (e.g. `--merge` without `--merge-dir`, unreadable report).

## Relationships

- **`scripts/mutation/baseline.ts`** – Supplies all domain logic: `compareToBaseline`, `compareMerged`, `nextBaseline`, `mergeIntoBaseline`, `readBaseline`, `readReport`, `readReportsUnder`, `writeBaseline`, `formatRegressions`, `missingFromReport`, and the `BASELINE_PATH` constant. This file is the thin CLI shell over that module.
- **`scripts/cli.ts`** – Provides the `hasFlag` and `flagValue` helpers used to parse the `--update`, `--merge`, and `--merge-dir` flags.

## Notes

- **First-baseline safety:** If no baseline file exists yet, a bare check exits 0 with a hint (nothing to compare against is not a failure). A baseline is only created when the caller explicitly passes `--update` or `--merge`, preventing an accidental partial baseline from a local `--mutate` run.
- **Ratchet semantics on regression:** Even with `--update`, `nextBaseline` takes the *higher* of old and new scores, so a regressed file keeps its old (higher) baseline and stays failing until genuinely fixed.
- **`--merge` vs `--update`:** `--merge` is designed for sharded sweeps where each shard only covers a subset of files; `--update` assumes the report is the full scope. Mixing them up is the primary footgun.
- **Frontend copy:** Per the header comment, the frontend project ships the same CLI minus the `--merge` path, since it has no sharded pass.
- **No named exports** – this is a `#!/usr/bin/env tsx` script, not a library module.
