---
source: scripts/mutation/stryker-run.ts
sha256: ec4ab1ad680f50069d3feb6ee0cc78d444200ecf38b831763ed6fe4996ff689a
generated_at: 2026-10-15T09:43:47.780985+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/stryker-run.ts

## Purpose

Shared "half" of every Stryker mutation invocation: resolves concurrency and heap settings from the local machine, cleans the scratch directory, spawns Stryker, and aborts the run if workers OOM-loop. Both entry points (`run-diff`, `run-shards`) call into this file rather than invoking `npx stryker` directly, because a bare invocation would skip the heap cap that a memory-constrained machine cannot afford.

## Key elements

- **`STRYKER_WORKER_PEAK_MB` (2900)** — measured peak RSS of one Stryker/jest worker; used as the denominator when computing how many workers fit in available RAM.
- **`STRYKER_OS_RESERVE_MB` (4096)** — headroom subtracted from `MemAvailable` before dividing by peak RSS; deliberately 2× the `OS_RESERVE_MB` in `machine-budget.ts` to account for the Stryker orchestrator process itself.
- **`TEST_TMP_BASE`** — `REPO_ROOT/tmp/test/`; the scratch root for jest's in-memory Mongo data, cleared before every run.
- **`OOM_LIMIT` / `OOM_WINDOW_MS`** — 6 restarts within 10 minutes triggers the abort; a single restart is considered survivable.
- **`resolveConcurrency(): number`** — returns `STRYKER_CONCURRENCY` if set, otherwise `max(1, min(cpus-1, (availableMemoryMb - reserve) / peakMb))`.
- **`StrykerOutcome`** — `{ code: number; abortedForOom: boolean }`, the result shape returned to callers.
- **`runStryker({ args, label? }): Promise<StrykerOutcome>`** — the main entry: clears scratch, spawns `npx stryker run` with computed concurrency and `NODE_OPTIONS` (`--expose-gc`, optional `--max-old-space-size`), streams stdout while counting "ran out of memory" lines, and kills the child on OOM-loop.

## Relationships

- **`scripts/modules-on-disk.ts`** — provides `REPO_ROOT`, used both as the `cwd` for the spawned process and as the base for `TEST_TMP_BASE`.
- **`scripts/testing/machine-budget.ts`** — provides `availableMemoryMb()` (feeds `resolveConcurrency`) and `environmentKnob()` (reads `STRYKER_CONCURRENCY`, `STRYKER_WORKER_HEAP_MB`). Its `OS_RESERVE_MB` (2048) is the reference that `STRYKER_OS_RESERVE_MB` (4096) intentionally exceeds.
- **`scripts/mutation/run-diff.ts`** — one of the two entry points that calls `runStryker` with a diff-scoped argument list.
- **`scripts/mutation/run-shards.ts`** — the other entry point that calls `runStryker` with a shard-scoped argument list.

## Notes

- **Env spread, not `.env` merge.** The child environment is built from `...process.env` directly. Merging `.env` first would leak `NODE_REDIS_URL` / `NODE_RATE_LIMIT_REDIS_URL` into every spawned jest before `tests/support/setup-environment.ts` can override them, causing rate-limit suites to fail open.
- **Scratch is cleaned *before* the run, not after.** A killed jest worker never reaches its own teardown; Stryker kills workers as a matter of course, so the next start must be clean.
- **`--concurrency` is suppressed if the caller already passes it.** `runStryker` checks `args` for an existing `--concurrency` flag before appending its own.
- **stdout is `pipe`d, not inherited**, solely so the OOM-restart counter can inspect chunks. Every byte is forwarded unchanged to `process.stdout`, so progress bars and reports still appear in the terminal.
- **OOM detection is a naive string split** on the literal `"ran out of memory"` in stdout chunks; it counts occurrences across the entire run and compares against `OOM_LIMIT`.
- **`NODE_OPTIONS` preserves any pre-existing value** by appending rather than replacing; the `--max-old-space-size` flag is omitted entirely when `STRYKER_WORKER_HEAP_MB` is unset, leaving Node's flat ~4.2 GB default in place.
