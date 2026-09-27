---
source: src/infrastructure/runtime/cluster-policy.ts
sha256: 07c471a0316bd51832bc039ae98ced11656f0e7148071e7ed0fa1c65faee5c0f
generated_at: 2026-09-27T14:14:50.448720+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/cluster-policy.ts

## Purpose

Pure decision functions extracted from the cluster primary in `src/cluster.ts`: how many workers to fork and how to respond to a worker crash. Kept as side-effect-free logic so each rule can be unit-tested independently of the process-lifecycle script.

## Key elements

- **`workerTarget(requested, availableCpus)`** — Returns the worker count. Uses `requested` when > 0, otherwise falls back to `availableCpus`; always returns ≥ 1.
- **`CrashVerdict`** — Discriminated union: `{ action: 'respawn', delayMs, recentCrashes }` or `{ action: 'give-up', recentCrashes }`.
- **`CrashPolicy`** — Interface of tunables read from `NODE_CLUSTER_CRASH_*`: `windowMs`, `backoffBaseMs`, `backoffMaxMs`, `maxCrashes`.
- **`crashVerdict(history, now, policy)`** — Filters `history` to the current window, appends `now`, and either returns a respawn verdict with exponential backoff (`backoffBaseMs * 2^(n-1)`, capped at `backoffMaxMs`) or a give-up verdict when the crash count exceeds `maxCrashes`. Also returns the pruned `recentCrashes` array for the next call.

## Relationships

- **`src/cluster.ts`** — The primary process that *calls* `workerTarget` and `crashVerdict`. This file holds the logic; `cluster.ts` holds the side effects (forking, timers, process exit).
- **`tests/unit/infrastructure/runtime/cluster-policy.test.ts`** — Unit tests exercising `workerTarget` and `crashVerdict` in isolation, made possible by the pure-function extraction.

## Notes

- Pass `os.availableParallelism()` as `availableCpus`, **not** `os.cpus().length` — the former respects container CPU affinity limits; the latter reports every host core.
- The `give-up` path is load-bearing: it lets the primary exit so the container supervisor can restart and alert. Without it, a worker that crashes at import (e.g. bad config) would be respawned indefinitely and the container would appear healthy.
- `recentCrashes` in the return value is the *pruned* history (only entries within `windowMs` plus the current crash), ready to be stored and passed back on the next call.
