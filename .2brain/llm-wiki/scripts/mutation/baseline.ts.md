---
source: scripts/mutation/baseline.ts
sha256: 3167a2bdbe0ebcd45ea76fbc1c0ca49c94cef3dc0c04c28d28f7ff1e27d50c2a
generated_at: 2026-10-29T01:38:05.844107+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/baseline.ts

## Purpose

Implements a per-file mutation-score ratchet on top of Stryker's global thresholds. It records what each file scored on a real run, then enforces that a file's score never silently drops: a regression fails the check, an improvement rewrites the baseline upward, and lowering a baseline is always an explicit human decision. This prevents one strong file from masking a weak one under a single global average.

## Key elements

- **`REPORT_PATH` / `BASELINE_PATH`** — Fixed paths: `tmp/reports/mutation/mutation.json` (Stryker JSON output) and `mutation-baseline.json` (the committed ratchet).
- **`SCORE_TOLERANCE`** — 1-point band that absorbs the timeout/survivor race under variable machine load; a real regression moves a file far more.
- **`KILLED` / `NOT_VIABLE`** — Status sets that define the scoring denominator. `Timeout` counts as killed (Stryker convention); `RuntimeError`, `CompileError`, `Ignored` are excluded entirely.
- **`scoresFromReport(report)`** — Computes a per-file percentage (two decimals) from a Stryker JSON report. Files whose mutants are all non-viable score 100.
- **`readReport()`** — Reads and scores the single-run report at the fixed `REPORT_PATH`; throws if absent.
- **`readReportsUnder(directory)`** — Walks a directory tree, merges every `mutation.json` found, and returns one combined score map. Used when a sharded sweep produces one report per shard.
- **`readBaseline()` / `writeBaseline(baseline)`** — Read/write `mutation-baseline.json` (indented JSON, trailing newline).
- **`compareToBaseline(current, baseline?)`** — Returns a sorted `FileComparison[]` with verdicts `new | removed | regressed | improved | held` for every file in the union of both sets.
- **`compareMerged(current, baseline?)`** — Same as `compareToBaseline` but filters out `removed` verdicts, since mid-sweep absence means "not measured yet," not "left scope."
- **`nextBaseline(current, baseline?)`** — Builds the post-run baseline from `current`'s keys only (full-run semantics). Never lowers a score.
- **`mergeIntoBaseline(current, baseline?)`** — Builds a post-merge baseline that preserves all existing entries and only touches files `current` actually measured (partial-run semantics). Never lowers a score.
- **`missingFromReport(current, baseline?)`** — Lists baseline files absent from `current`; used to guard against recording a partial run as a full baseline.
- **`formatRegressions(comparisons)`** — Human-readable multi-line summary of regressed files, including the tolerance value and the `--update` instruction. Returns `''` when nothing regressed.
- **`MutationBaseline`, `FileComparison`, `FileVerdict`** — Exported types consumed by downstream scripts and tests.

## Relationships

- **`github/workflows/mutation.yml`** — Orchestrates the mutation pipeline: triggers runs, uploads shard artifacts, and invokes the check/merge steps that call into this module.
- **`scripts/mutation/run-shards.ts`** — Produces per-shard `mutation.json` files under distinct artifact directories; `readReportsUnder` and `compareMerged`/`mergeIntoBaseline` exist specifically to consume that multi-report layout.
- **`scripts/mutation/ci/cli.ts`** — The CI merge job that calls `readReportsUnder`, `compareMerged`, and `mergeIntoBaseline` to grade a sharded sweep and update the baseline incrementally.
- **`scripts/mutation/check-baseline.ts`** — The local `npm run mutation:check` entry point; uses `readReport`, `compareToBaseline`, `nextBaseline`, and `formatRegressions` for a full-scope run.
- **`scripts/mutation/pull-report.ts`** — Generates the PR-facing mutation report; consumes `FileComparison` data and verdicts produced here.
- **`scripts/mutation/run-diff.ts`** — Single-run mutation executor whose output (the JSON report at `REPORT_PATH`) is read by `readReport`.
- **`tests/unit/scripts/mutation/baseline.test.ts`** — Unit tests covering the scoring, comparison, ratchet, and formatting logic in this file.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Tests the CI wave/merge flow, exercising `compareMerged` and `mergeIntoBaseline` with multi-shard inputs.

## Notes

- **Ratchet asymmetry.** Both `nextBaseline` and `mergeIntoBaseline` apply `Math.max(before, score)`. A regressed file keeps its old (higher) baseline and stays failing until it is genuinely fixed or a human deliberately re-records it with `--update`.
- **`nextBaseline` vs `mergeIntoBaseline`.** `nextBaseline` rebuilds the file map from `current`'s keys alone (correct after a full run where absence means "left scope"). `mergeIntoBaseline` starts from the previous map and only overwrites keys present in `current` (correct mid-sweep where absence means "not measured yet"). Mixing them up silently drops or retains files incorrectly.
- **All-non-viable files score 100**, not 0, to avoid a permanent false alarm on the ratchet for files with no testable mutants.
- **`compareMerged` suppresses `removed`** deliberately: only a whole-scope run (`compareToBaseline`) can distinguish "file left the mutate scope" from "shard not yet processed."
- **`missingFromReport`** is a safety guard: recording a partial run via `nextBaseline` would wipe every file not in the report. Callers should check this before committing a baseline.
- The header notes that the frontend holds its own copy of this logic with the same shape, and that `stryker.json` is the single source of truth for mutation configuration.
