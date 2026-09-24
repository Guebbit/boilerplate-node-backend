---
source: scripts/mutation/check-baseline.ts
sha256: 2957c5fdfe066d71140ccfe32e87a5546ad9417f71f2776e30fefef4c5a74bee
generated_at: 2026-09-23T17:28:06.804054+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/check-baseline.ts

## Purpose

CLI entry point for the per-file mutation-score ratchet. It reads a pre-generated Stryker report and compares per-file scores against a stored baseline, exiting non-zero if any file regressed. It never launches Stryker itself, keeping the gate cheap enough to run in a separate CI step from the actual mutation run.

## Key elements

- **Three invocation modes** (selected via `process.argv` flags, no external arg-parsing library):
    - _Bare check_ (`npm run mutation:check`) — compare current report to baseline, report regressions, write nothing.
    - `--update` — same comparison, but also records the run as the new baseline (keeping the higher score per file, so regressed files stay failing).
    - `--merge --merge-dir=<dir>` — fold multiple sharded-sweep reports (every `mutation.json` under the given directory) into the baseline, leaving files no shard measured untouched.
- **Partial-report guard** — before `--update` writes, `missingFromReport` checks whether the report covers fewer files than the baseline knows about; if so, the write is refused with an explanatory message (exit 1).
- **No-baseline handling** — a bare check with no baseline file is a no-op (exit 0); `--update` or `--merge` with no baseline records the first one.
- **Exit codes** — `0` pass, `1` one or more files regressed (or partial-report refusal), `2` report missing or bad arguments.
- **All domain logic** (reading/writing the baseline, comparison, formatting) is imported from `./baseline`; this file contains only argument parsing, I/O orchestration, and console output.

## Relationships

- **`scripts/mutation/baseline.ts`** — sole dependency. Provides every function this file calls (`readReport`, `readReportsUnder`, `readBaseline`, `writeBaseline`, `compareToBaseline`, `compareMerged`, `missingFromReport`, `nextBaseline`, `mergeIntoBaseline`, `formatRegressions`) plus the `BASELINE_PATH` constant. This file is the CLI shell; `baseline.ts` is the library.

## Notes

- The script is deliberately split from the Stryker run so CI can place the mutation sweep and the gate in separate steps (or split across shards).
- `--update` is scoped to "this report is the whole codebase." Sharded or partial runs must go through `--merge`; using `--update` on a partial run is actively blocked.
- New and improved files are printed even on a fully passing run, so a quiet `0` exit doesn't look identical to a check that silently did nothing.
- The baseline file lives under `tmp/` (gitignored), so only local runs can accidentally create a partial first baseline — the no-baseline / no-flag branch exists to prevent that.
- A frontend copy of this CLI exists (same logic, minus `--merge`) for repos that never run a sharded pass.
