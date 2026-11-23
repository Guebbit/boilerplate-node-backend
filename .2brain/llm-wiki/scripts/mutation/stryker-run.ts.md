---
source: scripts/mutation/stryker-run.ts
source_sha256: d5450d5965238952e2c0bd993bb43ed5c3a2deef7f94ce38e5f0ec3ca5ee87d3
context_sha256: bf40c310e23502cd4f7ee0f99bb3298f3813412b8300977cc28cf38e3e2f6641
generated_at: 2026-11-22T02:11:02.516559+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/mutation/stryker-run.ts

## Purpose
Runs a single Stryker invocation sized for the current machine. It is the shared core of both mutation entry points (`run-diff`, `run-shards`), so that every run gets the same concurrency, per-worker heap cap, scratch-directory sweep and OOM-loop abort. Calling `npx stryker` directly would skip the heap cap.

## Key elements
- `runStryker({ args, label? })`: the only export. It spawns `npx stryker run [--concurrency N] ...args` in `REPO_ROOT` and returns `Promise<StrykerOutcome>`.
  - `args` are appended verbatim after `run`.
  - `label` is printed in the settings log line.
- `StrykerOutcome`: an exported interface, `{ code, abortedForOom }`.
- `resolveConcurrency()` (internal):
  - `STRYKER_CONCURRENCY` wins when set.
  - Otherwise it takes `max(1, min(CPUs - 1, floor((availableMemoryMb() - 4096) / 2900)))`.
- Constants:
  - `STRYKER_WORKER_PEAK_MB` = 2900.
  - `STRYKER_OS_RESERVE_MB` = 4096, double the `OS_RESERVE_MB` in `machine-budget.ts`.
  - `TEST_TMP_BASE` = `<REPO_ROOT>/tmp/test-mutation`.
  - `OOM_LIMIT` = 6.
  - `OOM_WINDOW_MS` = 10 minutes.
- Child environment:
  - It spreads `process.env` and sets `NODE_TEST_TMP_BASE`.
  - It appends `--expose-gc` to `NODE_OPTIONS`, plus `--max-old-space-size=<STRYKER_WORKER_HEAP_MB>` when that knob is set.
- OOM guard:
  - Stryker's stdout is piped and forwarded unchanged.
  - Occurrences of `ran out of memory` are counted.
  - When 6 or more occur within the first 10 minutes, it prints a diagnostic, sends `SIGTERM` and sets `abortedForOom`.
- Exit handling: the promise resolves with code `1` if the guard aborted the run, otherwise with the child's exit code (falling back to `1`).

## Relationships
- `scripts/testing/machine-budget.ts`: supplies `availableMemoryMb` (free memory) and `environmentKnob` (reads `STRYKER_CONCURRENCY` and `STRYKER_WORKER_HEAP_MB`). The OS reserve here is deliberately larger than that file's own.
- `scripts/modules-on-disk.ts`: supplies `REPO_ROOT`, used for the child's working directory and the scratch path.
- `scripts/mutation/run-diff.ts` and `scripts/mutation/run-shards.ts`: the two callers of `runStryker`. They rely on it for the machine-specific settings.

## Notes
- The scratch directory is deleted before every run, not after, because killed jest processes never reach their own teardown. It is a dedicated folder so the sweep cannot touch `tmp/test/` or `tmp/reports/`.
- `--concurrency` is added only when the caller's `args` don't already include one starting with `--concurrency`.
- `process.env` is spread directly rather than merged with `.env`. A merged `.env` would bypass `DOTENV_PATH` and leak Redis URLs into every jest suite.
- If `STRYKER_WORKER_HEAP_MB` is unset, no heap flag is added and Node's default heap (about 4.2 GB, not scaled to RAM) applies. The settings log line says so.
- The heap cap does not bound memory held outside V8's heap, such as `bson` buffers.
- The OOM check counts matches per stdout chunk. It stops counting once the run is past the 10-minute window.
