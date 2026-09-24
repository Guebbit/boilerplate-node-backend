---
source: scripts/mutation/stryker-run.ts
sha256: e42f096b0c2df1b1d1508292e7041449253e9d81b2301304edf462f0cddb0bb0
generated_at: 2026-09-23T17:29:23.171787+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/stryker-run.ts

## Purpose

Single-invocation wrapper around `npx stryker run` that sizes concurrency and heap for the current machine, clears the test scratch directory before each run, and aborts the process if an OOM-restart loop is detected. Both mutation entry points (`run-diff`, `run-shards`) call into this module so they share one implementation of the machine-aware settings.

## Key elements

- **`REPO_ROOT`** — resolved repo root; used as `cwd` for every spawned Stryker process.
- **`resolveConcurrency()`** — returns worker count. Honors `STRYKER_CONCURRENCY` env if set; otherwise takes the min of (logical CPUs − 1) and (available RAM − 4096 MB reserve) ÷ 2900 MB per-worker peak, floored at 1.
- **`StrykerOutcome`** — interface with `code: number` and `abortedForOom: boolean`, returned by `runStryker`.
- **`runStryker({ args, label })`** — the main export. Resolves concurrency, builds the child environment (injects `NODE_TEST_TMP_BASE`, optionally appends `--max-old-space-size`), deletes `tmp/test/` recursively, spawns `npx stryker run`, pipes stdout through an OOM-restart counter (6 restarts in 10 min → `SIGTERM`), and resolves with the outcome.
- **Constants** — `STRYKER_WORKER_PEAK_MB` (2900), `STRYKER_OS_RESERVE_MB` (4096), `TEST_TMP_BASE` (`tmp/test/`), `OOM_LIMIT` (6), `OOM_WINDOW_MS` (10 min).

## Relationships

- **`scripts/testing/machine-budget.ts`** — provides `availableMemoryMb` (reads `MemAvailable`) and `environmentKnob` (typed env-var reader). Both are imported at the top and used inside `resolveConcurrency` and `runStryker`.
- **`scripts/mutation/run-diff.ts`** — entry point that calls `runStryker` with a diff-scoped mutate list.
- **`scripts/mutation/run-shards.ts`** — entry point that calls `runStryker` per shard.

## Notes

- Concurrency is RAM-bounded, not CPU-bounded, unlike Jest's heuristic. The 4096 MB OS reserve is deliberately double the 2048 MB used in `machine-budget.ts` because the Stryker orchestrator process is an additional consumer.
- `--max-old-space-size` raises V8's heap cap but does **not** bound native/buffer memory (e.g. `bson`); a worker can still OOM outside the heap.
- The scratch sweep (`rm` on `tmp/test/`) happens **before** the run, not after, because Stryker kills workers and a killed Jest never reaches its own teardown.
- `.env` is deliberately **not** merged into the child environment; only `process.env` is spread, so test-setup overrides in `tests/support/setup.ts` still take effect.
- If the caller already passes `--concurrency` in `args`, the computed value is not appended (the caller's flag wins).
- OOM detection is a string count of `"ran out of memory"` on stdout; it is not a signal-based check.
