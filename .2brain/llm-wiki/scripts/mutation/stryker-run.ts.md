---
source: scripts/mutation/stryker-run.ts
sha256: be846aaccce6edbed2ee60fe81c5386329edf49cdbd179673e6cc2381f29eb3f
generated_at: 2026-11-08T02:54:56.429491+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/stryker-run.ts

## Purpose

Shared Stryker invocation layer that every mutation entry point funnels through. It sizes worker concurrency and per-worker heap to the *current* machine (rather than trusting `stryker.json`'s committed values), sweeps the scratch directory before the run, and aborts the process if an OOM-restart loop shows the run will not converge.

## Key elements

- **`runStryker({ args, label })`** — Spawns `npx stryker run …`, injecting the computed `--concurrency`, `NODE_OPTIONS` flags (`--expose-gc`, optional `--max-old-space-size`), and `NODE_TEST_TMP_BASE`. Pipes stdout to the terminal *and* scans it for the OOM signature. Returns `StrykerOutcome`.
- **`StrykerOutcome`** — `{ code: number; abortedForOom: boolean }`. Distinguishes a normal exit from a guard-triggered abort.
- **`resolveConcurrency()`** — Returns `STRYKER_CONCURRENCY` if set, otherwise `max(1, min(logicalCPUs − 1, freeRAM / STRYKER_WORKER_PEAK_MB))`.
- **Constants** — `STRYKER_WORKER_PEAK_MB` (2900), `STRYKER_OS_RESERVE_MB` (4096), `TEST_TMP_BASE` (`tmp/test-mutation/`), `OOM_LIMIT` (6), `OOM_WINDOW_MS` (10 min). All tuned so the guard fires on a true loop but tolerates one or two heavy-suite restarts.

## Relationships

- **`scripts/testing/machine-budget.ts`** — Imports `availableMemoryMb()` and `environmentKnob()`; the concurrency formula and the `STRYKER_CONCURRENCY` / `STRYKER_WORKER_HEAP_MB` overrides both flow through it.
- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT` to set the spawn `cwd` and to build `TEST_TMP_BASE`.
- **`scripts/mutation/run-diff.ts`** — Entry-point caller; passes its `--mutate` / `--files` args into `runStryker`.
- **`scripts/mutation/run-shards.ts`** — Entry-point caller; passes shard-scoped args into `runStryker`.

## Notes

- **Env spreading order matters.** `childEnvironment` is `{ ...process.env, … }`. The file deliberately does *not* merge `.env` first; doing so would leak real `NODE_REDIS_URL` / `NODE_RATE_LIMIT_REDIS_URL` values into every spawned jest before `tests/support/setup-environment.ts` can override them, causing rate-limit suites to fail open.
- **`--concurrency` is only injected when the caller has not already supplied it.** Check `args.some(a => a.startsWith('--concurrency'))` before appending.
- **Scratch sweep happens *before* the run** (`rm(TEST_TMP_BASE, { recursive, force })`). A killed jest never reaches its own teardown, so the previous run's in-memory Mongo data must be gone before the next start.
- **`TEST_TMP_BASE` is intentionally separate from `tmp/test/` and `tmp/reports/`** so the wholesale sweep cannot destroy a concurrent plain-test database or this run's incremental Stryker cache.
- **Stdout is piped (not inherited) on the child** so the OOM counter can scan chunks; every chunk is still forwarded to `process.stdout.write` unchanged, preserving the progress bar.
- **The OOM guard kills with `SIGTERM` and forces `code` to 1** in the resolved `StrykerOutcome`, even if the child would have exited 0 (it won't in practice, but the guard's own `abortedForOom` flag is the source of truth).
