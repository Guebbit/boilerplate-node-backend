---
source: scripts/mutation/stryker-run.ts
sha256: f628922f976e8af30e52942606f001a90208c975197177d6534b4e9cc3de8cf5
generated_at: 2026-10-14T07:21:06.381297+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/stryker-run.ts

## Purpose

Centralises everything both mutation entry points (`run-diff`, `run-shards`) share in a single Stryker invocation: machine-derived worker concurrency, per-worker V8 heap cap, pre-run scratch-directory sweep, and an OOM-restart abort guard. Exists so that neither entry point calls `npx stryker` directly — a bare invocation silently runs without the heap cap, which is the one setting a run on a high-RAM machine cannot do without.

## Key elements

- **`REPO_ROOT`** — Resolved repo root; used as `cwd` for every spawned Stryker/jest process.
- **`resolveConcurrency(): number`** — Returns `STRYKER_CONCURRENCY` if set; otherwise the minimum of `logical CPUs − 1` and `(free RAM − 4096 MB) / 2900 MB`, floored at 1. RAM is the binding constraint, not cores.
- **`StrykerOutcome`** — `{ code: number; abortedForOom: boolean }`, the shape both entry points inspect to decide how to report the run.
- **`runStryker({ args, label? }): Promise<StrykerOutcome>`** — Spawns `npx stryker run …` with:
  - `--concurrency` injected unless the caller already passed it,
  - `NODE_OPTIONS` extended with `--expose-gc` and an optional `--max-old-space-size`,
  - `NODE_TEST_TMP_BASE` pointing at `tmp/test/`,
  - `tmp/test/` deleted (recursively, forced) *before* the child starts,
  - stdout piped so the OOM guard can count "ran out of memory" lines while still forwarding output to the terminal,
  - abort (`SIGTERM`) if ≥ 6 restarts occur within the first 10 minutes.

## Relationships

- **`scripts/mutation/run-diff.ts`** — Entry point for diff-based mutation runs; calls `runStryker` with its own `--mutate` scope and reads the returned `StrykerOutcome`.
- **`scripts/mutation/run-shards.ts`** — Entry point for shard-based runs; same contract via `runStryker`.
- **`scripts/testing/machine-budget.ts`** — Supplies `availableMemoryMb()` (reads `MemAvailable`) and `environmentKnob()` (typed env-var access) used by `resolveConcurrency` and the heap-cap knob.

## Notes

- The OS reserve here is **4096 MB**, double `machine-budget.ts`'s own 2048, because the Stryker orchestrator process is an extra consumer a plain jest run never has.
- `--max-old-space-size` is a **flat** ~4.2 GB V8 default, not a share of machine RAM. It does not bound non-heap memory (e.g. `bson` buffers). Override with `STRYKER_WORKER_HEAP_MB`.
- The scratch sweep clears **only `tmp/test/`**, not all of `tmp/`, so `tmp/reports/` (incremental Stryker cache) survives.
- `.env` is deliberately **not** merged into the child environment; only `process.env` is forwarded. This prevents real Redis URLs from reaching jest before `tests/support/setup-environment.ts` can override them.
- The OOM guard counts the literal string `"ran out of memory"` on stdout chunks. A single restart is tolerated; the 6-in-10-minutes threshold is a hard stop.
- `--concurrency` is only injected when the caller has **not** already passed it in `args`, so callers can override the computed value on a per-invocation basis.
