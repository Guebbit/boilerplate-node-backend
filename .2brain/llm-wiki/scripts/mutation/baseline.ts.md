---
source: scripts/mutation/baseline.ts
sha256: b7f0b941ba97a82975f59c79ad1da1eeb6d7266444ba373093e146a7e78df7ef
generated_at: 2026-09-23T17:27:54.391951+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/baseline.ts

## Purpose

Implements a **per-file mutation ratchet** on top of Stryker. Stryker's built-in thresholds are global (one weak file can be masked by a strong one), so this module records a per-file mutation-score floor and enforces it: a file may never drop below its last recorded score, and its score only ever moves up unless a person explicitly re-baselines it. It also handles reading Stryker's JSON report, sharded-report merging, and formatting regression output.

## Key elements

- **`REPORT_PATH` / `BASELINE_PATH`** – Fixed paths: `tmp/reports/mutation/mutation.json` (Stryker JSON output) and `mutation-baseline.json` (committed ratchet state).
- **`SCORE_TOLERANCE`** (`1`) – Maximum allowed drop before a file is flagged as regressed. Absorbs the timeout/survivor classification race under load.
- **`scoresFromReport(report)`** – Computes a per-file score (killed / scored-mutants × 100, two decimals) from a Stryker JSON report. Non-viable statuses (`RuntimeError`, `CompileError`, `Ignored`) are excluded from the denominator; a file with zero viable mutants gets 100.
- **`readReport(root?)`** – Reads and parses a single Stryker report from disk; throws with a helpful message if missing.
- **`readReportsUnder(directory)`** – Recursively walks a directory tree, merging every `mutation.json` it finds into one score map (for sharded sweeps where each shard writes its own report).
- **`readBaseline` / `writeBaseline`** – JSON read/write of the committed `MutationBaseline` (`{ generatedAt, files }`).
- **`compareToBaseline(current, baseline?)`** – Full file-by-file comparison; produces verdicts `held | improved | regressed | new | removed`. Includes `removed` (file left the mutate scope).
- **`compareMerged(current, baseline?)`** – Same comparison **without** `removed`; intended for partial (sharded) runs where a missing file means "not measured yet," not "deleted."
- **`nextBaseline(current, baseline?)`** – Builds the baseline to commit after a **full** run. Ratchet rule: `Math.max(previous, current)` per file.
- **`mergeIntoBaseline(current, baseline?)`** – Baseline update for a **partial/sharded** run: preserves existing entries, only touches files present in `current`, same never-lower rule.
- **`missingFromReport(current, baseline?)`** – Returns baseline files absent from `current`; used as a guard to prevent recording a partial run as a full baseline.
- **`formatRegressions(comparisons)`** – Human-readable summary of regressed files with actionable guidance (empty string if none).
- **`FileVerdict` / `FileComparison`** – Types for the per-file comparison result.

## Relationships

- **`scripts/mutation/check-baseline.ts`** – The consumer script that calls `readReport` / `readReportsUnder`, `compareToBaseline` / `compareMerged`, `nextBaseline` / `mergeIntoBaseline`, and `formatRegressions` to gate or update the baseline.
- **`scripts/mutation/run-shards.ts`** – Produces the per-shard `mutation.json` reports that `readReportsUnder` and `compareMerged` are designed to consume.
- **`github/workflows/mutation.yml`** – CI workflow that orchestrates the sharded mutation run and the subsequent baseline check step.
- **`tests/unit/scripts/mutation/baseline.test.ts`** – Unit tests exercising the exported functions in this file.

## Notes

- The ratchet is **asymmetric by design**: `nextBaseline` and `mergeIntoBaseline` both use `Math.max(prev, current)`. A regressed file keeps its old (higher) score and keeps failing until genuinely fixed. Lowering a baseline is a human decision made via `--update` in a commit.
- `compareToBaseline` vs `compareMerged`: use the former for full-scope runs (it reports `removed`); use the latter for sharded/partial runs (it silently skips files not in the current batch). Mixing them up either hides scope removals or false-alarms on unmeasured files.
- `missingFromReport` is a **safety guard**, not a check: call it before `nextBaseline` to ensure the report covers the full baseline before recording.
- The `KILLED` set includes `Timeout` (Stryker's convention: a hanging mutant was detected). The `NOT_VIABLE` set excludes `Ignored` — a file where _every_ mutant is ignored gets a score of 100, not 0.
- The frontend has a **separate copy** of this ratchet with the same shape, per the header comment; changes here may need to be mirrored there.
