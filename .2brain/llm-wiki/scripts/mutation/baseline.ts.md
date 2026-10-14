---
source: scripts/mutation/baseline.ts
sha256: 755403961c764ae9ee6edb50bbb375dd9ce822eed07ae93ed88d5878be64fefb
generated_at: 2026-10-14T07:19:26.170271+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/baseline.ts

## Purpose

Implements the **per-file mutation ratchet**: it turns a Stryker JSON report into per-file mutation scores, compares them against a committed baseline (`mutation-baseline.json`), and enforces that scores only ever move up. Stryker's own thresholds are global, so this file exists to prevent one strong file from masking a weak one and to give each file an individually actionable regression gate.

## Key elements

- **`SCORE_TOLERANCE`** (= 1) — absorbs the timeout/survivor race so a gate doesn't fail randomly under load.
- **`scoresFromReport`** — converts a Stryker JSON report into a `Record<string, number>` of per-file percentages. Files whose mutants are all non-viable score 100.
- **`readReport` / `readReportsUnder`** — load a single fixed-path report or walk a directory tree of sharded reports and merge them.
- **`readBaseline` / `writeBaseline`** — read/write `mutation-baseline.json` (indented JSON, trailing newline).
- **`compareToBaseline`** — full-scope comparison; reports `new`, `removed`, `regressed`, `improved`, `held`.
- **`compareMerged`** — partial-scope comparison (mid-sweep); omits the `removed` verdict because an absent file simply hasn't been measured yet.
- **`nextBaseline`** — builds the next committed baseline from a full run's scores; existing scores only move up.
- **`mergeIntoBaseline`** — builds the next baseline from a partial (sharded) run; preserves entries for files not in the current report.
- **`missingFromReport`** — lists baseline files absent from a report, guarding against accidentally recording a partial run as the new baseline.
- **`formatRegressions`** — human-readable summary of regressed files (empty string when none).

## Relationships

- **`scripts/mutation/check-baseline.ts`** — the CI gate that calls `compareToBaseline` / `compareMerged` and `formatRegressions` to decide pass/fail.
- **`scripts/mutation/ci/cli.ts`** — orchestrates the full pipeline (run → read report → check → update) and selects between `nextBaseline` and `mergeIntoBaseline` depending on whether the run is full or sharded.
- **`scripts/mutation/run-shards.ts`** — produces the per-shard `mutation.json` artifacts that `readReportsUnder` merges.
- **`scripts/mutation/pull-baseline.ts`** — fetches/writes the baseline file in the CI context, relying on `readBaseline` / `writeBaseline`.
- **`github/workflows/mutation.yml`** — the workflow that invokes the above scripts in sequence.
- **`tests/unit/scripts/mutation/baseline.test.ts`** — unit tests covering score computation, verdict logic, ratchet asymmetry, and partial-vs-full comparison.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — exercises the wave-based sharding path that feeds `compareMerged` / `mergeIntoBaseline`.

## Notes

- **Ratchet asymmetry is intentional.** `nextBaseline` and `mergeIntoBaseline` both use `Math.max(before, score)`; a regression keeps the old (higher) value so the file keeps failing until it is genuinely fixed. Lowering a baseline is a human decision made in a commit.
- **`Timeout` counts as killed.** This follows Stryker's own convention (a hanging mutant was detected). `RuntimeError`, `CompileError`, and `Ignored` are excluded from the denominator entirely.
- **`compareToBaseline` vs `compareMerged`** differ only in the `removed` verdict. Using the wrong one mid-sweep would either hide legitimate removals or flag unmeasured files as removed.
- **`missingFromReport` is a safety check, not a verdict.** It exists so callers can refuse to run `nextBaseline` on a partial report before silently dropping the rest of the baseline.
- The frontend carries its own copy of this module with the same shape (noted in the file header); changes here may need to be mirrored.
