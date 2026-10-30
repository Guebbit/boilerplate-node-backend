---
source: scripts/mutation/stryker-run.ts
sha256: be846aaccce6edbed2ee60fe81c5386329edf49cdbd179673e6cc2381f29eb3f
generated_at: 2026-10-29T01:39:53.975718+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/stryker-run.ts

## Purpose

Single-implementation wrapper around `npx stryker run` that sizes a mutation run for the machine it's on: concurrency derived from free RAM, an optional per-worker heap cap, a pre-run scratch-directory sweep, and an OOM-loop abort. Both mutation entry points (`run-diff`, `run-shards`) call it so that the one setting a 30 GB machine cannot live without (the heap cap) is never accidentally omitted.

## Key elements

- **`runStryker({ args, label })`** — The sole exported entry point. Resolves concurrency, builds a `NODE_OPTIONS` string, sweeps `tmp/test-mutation/`, spawns `npx stryker run` with `stdio: ['inherit', 'pipe', 'inherit']`, streams stdout to the terminal while counting `"ran out of memory"` lines, and kills the process if ≥ 6 restarts occur within 10 minutes. Returns `Promise<StrykerOutcome>`.
- **`StrykerOutcome`** — `{ code: number; abortedForOom: boolean }`; `code` is forced to `1` when the OOM guard fired.
- **`resolveConcurrency()`** (internal) — Returns `STRYKER_CONCURRENCY` env if set; otherwise `max(1, min(cpus − 1, (MemAvailable − 4096) / 2900))`.
- **Constants** — `STRYKER_WORKER_PEAK_MB` (2900), `STRYKER_OS_RESERVE_MB` (4096), `TEST_TMP_BASE` (`<repo>/tmp/test-mutation`), `OOM_LIMIT` (6), `OOM_WINDOW_MS` (600 000).

## Relationships

- **`scripts/testing/machine-budget.ts`** — Imports `availableMemoryMb` (for the RAM-based concurrency cap) and `environmentKnob` (for reading `STRYKER_CONCURRENCY` / `STRYKER_WORKER_HEAP_MB` without leaking `.env` values into spawned workers).
- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT` to set the child's `cwd` and to anchor `TEST_TMP_BASE`.
- **`scripts/mutation/run-diff.ts`** — Calls `runStryker` to execute a diff-scoped mutation pass.
- **`scripts/mutation/run-shards.ts`** — Calls `runStryker` per shard in a parallel mutation sweep.

## Notes

- **Concurrency is RAM-bound, not CPU-bound.** The committed `stryker.json` says `concurrency: 4` (laptop-sized); this file overrides it unless the caller already passed `--concurrency` in `args` or set `STRYKER_CONCURRENCY`.
- **`NODE_OPTIONS` is built from `process.env`, not a merged `.env`.** This is deliberate: a merged `.env` would let real `NODE_REDIS_URL` / `NODE_RATE_LIMIT_REDIS_URL` reach every spawned jest before `setup-environment.ts` can override them, causing rate-limit suites to fail open.
- **Scratch is deleted *before* the run, not after.** Stryker kills jest workers routinely; a killed worker never reaches its own teardown, so the next invocation must start from a clean `tmp/test-mutation/`.
- **`--max-old-space-size` does not cap non-heap memory** (e.g. `bson` buffers). The OOM abort is the safety net for what the heap flag cannot prevent.
- **`stdout` is piped, not inherited**, solely so the OOM counter can inspect chunks; every byte is still forwarded to the terminal verbatim.
- If `heapMb` is unset, the log line explicitly prints `node default (~4.2 GB, NOT scaled to RAM)` to prevent a reader from assuming the machine's RAM was used.
