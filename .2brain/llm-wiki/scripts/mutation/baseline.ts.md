---
source: scripts/mutation/baseline.ts
sha256: 3167a2bdbe0ebcd45ea76fbc1c0ca49c94cef3dc0c04c28d28f7ff1e27d50c2a
generated_at: 2026-11-08T02:52:09.426364+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/baseline.ts

## Purpose

Implements the per-file mutation-score ratchet: it reads Stryker JSON reports, computes per-file kill percentages, compares them against a committed `mutation-baseline.json`, and enforces the rule that a file's recorded score can only ever go up. This exists because Stryker's built-in thresholds are global — a single weak file can be masked by strong ones — so this module tracks each file independently and fails the gate when any file drops below its own history.

## Key elements

- **`REPORT_PATH` / `BASELINE_PATH`** — fixed paths for the Stryker JSON report and the committed ratchet file.
- **`SCORE_TOLERANCE`** (1 point) — absorbs the Timeout-vs-Survivor race on loaded CI machines; not a real quality slack.
- **`scoresFromReport`** — converts a Stryker `MutationReport` into a `{ file → percentage }` map; non-viable mutants (`RuntimeError`, `CompileError`, `Ignored`) are excluded from the denominator; a file with zero viable mutants is scored 100.
- **`readReport`** — reads the single-run report at `REPORT_PATH` (throws if absent).
- **`readReportsUnder`** — walks a directory tree for every `mutation.json` and merges them (used by sharded sweeps).
- **`readBaseline` / `writeBaseline`** — load/save `mutation-baseline.json`.
- **`compareToBaseline`** — returns a `FileComparison[]` with verdicts `held | improved | regressed | new | removed`.
- **`compareMerged`** — same as above but filters out `removed` (a file absent mid-sweep is "not measured yet," not "left the scope").
- **`mergeIntoBaseline`** — builds a new baseline from a partial (shard) run, preserving entries the shard didn't cover.
- **`missingFromReport`** — lists baseline files absent from a partial report; used to guard against accidental re-baselining.
- **`nextBaseline`** — builds a new baseline from a full run; scores only move up (ratchet).
- **`formatRegressions`** — human-readable multi-line summary of regressed files with remediation guidance.

## Relationships

- **`scripts/mutation/check-baseline.ts`** — primary consumer; calls `readReport`/`readReportsUnder`, `readBaseline`, `compareToBaseline`/`compareMerged`, `missingFromReport`, `nextBaseline`/`mergeIntoBaseline`, `formatRegressions` to gate CI.
- **`scripts/mutation/run-shards.ts`** — produces the per-shard `mutation.json` artifacts that `readReportsUnder` and `mergeIntoBaseline` are designed to consume.
- **`scripts/mutation/ci/cli.ts`** — CLI entry that wires the shard-run → merge → check pipeline in CI.
- **`scripts/mutation/pull-report.ts`** — consumes `FileComparison[]` output to render PR-level summaries.
- **`scripts/mutation/run-diff.ts`** — triggers partial mutation runs whose reports must pass through `missingFromReport` before any baseline write.
- **`github/workflows/mutation.yml`** — orchestrates the workflow (run shards → upload reports → merge → check baseline) that exercises this module's shard-aware paths.
- **`tests/unit/scripts/mutation/baseline.test.ts`** — unit tests covering scoring, verdict logic, ratchet asymmetry, and merge behavior.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — exercises the sharded/merged comparison paths (`compareMerged`, `mergeIntoBaseline`) in wave-based CI scenarios.

## Notes

- **Ratchet is strictly one-directional.** Neither `nextBaseline` nor `mergeIntoBaseline` ever lowers a recorded score; a regression keeps the old higher value so the file stays failing until genuinely fixed. Lowering is a deliberate human action in a commit.
- **`removed` vs. "not measured yet."** `compareToBaseline` reports `removed` for files absent from `current`; `compareMerged` suppresses that verdict because a partial shard run legitimately lacks files. Only a full-scope run (behind `--update`) can distinguish the two.
- **`missingFromReport` is a safety gate, not an error.** It exists to prevent a partial `--mutate` run from silently dropping every other file from the baseline when `nextBaseline` is called.
- **Frontend parity.** The doc comment notes the frontend keeps a same-shaped copy of the baseline; changes to the `MutationBaseline` shape must be mirrored there.
- **`Timeout` counts as killed.** This follows Stryker's own convention and is baked into the `KILLED` set; do not treat it as a survivor when reading reports.
