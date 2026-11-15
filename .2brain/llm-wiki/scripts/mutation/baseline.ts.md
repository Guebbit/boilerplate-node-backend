---
source: scripts/mutation/baseline.ts
sha256: 138a938d0ffd209ad7c2d98f5284fed6aaf10caebd9760aac64e62ea2be19a80
generated_at: 2026-11-14T17:36:23.874625+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/baseline.ts

## Purpose

Implements a **per-file mutation-score ratchet** to replace Stryker's global threshold. It records each file's score from a real run, then enforces that a file may never drop below its recorded score (within a small tolerance) while allowing it to ratchet upward. This prevents one strong file from masking a weak one in an averaged global number, and makes the "only a human can lower a baseline" policy explicit in code.

## Key elements

- **Constants** — `REPORT_PATH` (`tmp/reports/mutation/mutation.json`), `BASELINE_PATH` (`mutation-baseline.json`), `SCORE_TOLERANCE` (1 point, absorbs timeout/survivor race under load).
- **`scoresFromReport(report)`** — computes a per-file percentage (killed / viable, 2 decimals). Files whose every mutant is `RuntimeError`/`CompileError`/`Ignored` are scored 100, not 0.
- **`readReport()`** — reads and scores the single fixed-path Stryker JSON report. Throws if absent.
- **`readReportsUnder(dir)`** — walks a directory tree, merges every Stryker JSON report found (used for sharded runs where each shard writes its own report).
- **`readBaseline()` / `writeBaseline(baseline)`** — read/write the committed `mutation-baseline.json` (indented JSON + trailing newline).
- **`compareToBaseline(current, baseline?)`** — returns a sorted `FileComparison[]` with verdicts: `new`, `removed`, `regressed`, `held`, `improved`.
- **`compareMerged(current, baseline?)`** — same as above but filters out `removed` verdicts; safe for partial/sharded runs where "absent" means "not measured yet."
- **`mergeIntoBaseline(current, baseline?)`** — updates only the files present in `current`, preserving all existing entries. Use after a partial/merged shard run.
- **`nextBaseline(current, baseline?)`** — rebuilds the full baseline from `current`'s keys, applying the ratchet rule (`Math.max(previous, current)`). Use only after a run covering the entire mutate scope.
- **`missingFromReport(current, baseline?)`** — lists baseline files absent from `current`, guarding against accidentally recording a partial run as a full one.
- **`formatRegressions(comparisons)`** — returns a human-readable summary string of regressed files (empty string if none).
- **`FileVerdict`, `FileComparison`, `MutationBaseline`** — shared type definitions.

## Relationships

- **`scripts/mutation/run-shards.ts`** — runs the sharded mutation sweep; each shard's Stryker report is written under a distinct directory that `readReportsUnder` walks and merges.
- **`scripts/mutation/ci/cli.ts`** — CI orchestrator that calls into these helpers to read reports, compare, and decide pass/fail.
- **`scripts/mutation/check-baseline.ts`** — the gate script that pairs `readReport`/`readBaseline` with `compareToBaseline` and exits non-zero on regression.
- **`scripts/mutation/pull-report.ts`** — formats PR-facing output; consumes `FileComparison[]` or the output of `formatRegressions`.
- **`scripts/mutation/run-diff.ts`** — runs a partial (diff-scoped) mutation; its report feeds `compareMerged` / `mergeIntoBaseline` rather than `nextBaseline`.
- **`github/workflows/mutation.yml`** — CI workflow that wires the above scripts together (run shards → merge → check → report).
- **`tests/unit/scripts/mutation/baseline.test.ts`** — unit tests for every exported function.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — tests the sharding/wave logic that determines how `run-shards.ts` partitions the mutate scope.

## Notes

- **Ratchet asymmetry is intentional.** `nextBaseline` and `mergeIntoBaseline` both apply `Math.max(previous, current)`. A regressed file keeps its old (higher) score so it stays red until genuinely fixed. Lowering a baseline is always a manual, committed, reasoned act.
- **`compareMerged` vs `compareToBaseline`.** The former suppresses `removed` verdicts because in a partial run "file absent from current" means "not yet measured," not "left the scope." Only a full-scope run can distinguish the two.
- **`Timeout` counts as killed.** This follows Stryker's own convention (a hanging mutant was detected, just expensively). The tolerance band (1 pt) absorbs the timeout/survivor boundary that shifts with machine load.
- **All-non-viable files score 100, not 0.** A file where every mutant is `RuntimeError`/`CompileError`/`Ignored` had nothing for tests to catch; scoring it 0 would create a permanent false alarm.
- **Frontend has its own copy.** The header notes the frontend repo carries a same-shaped copy of this logic, driven by the same "one ruler, one report, one baseline" principle with `stryker.json` as the single config source.
