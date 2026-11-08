---
source: src/infrastructure/runtime/cluster-policy.ts
sha256: 07c471a0316bd51832bc039ae98ced11656f0e7148071e7ed0fa1c65faee5c0f
generated_at: 2026-11-08T03:46:00.853163+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/cluster-policy.ts

## Purpose

Pure decision functions for the cluster primary: how many workers to fork and what to do when a worker crashes. Extracted from the primary (a script with process side effects) so each rule can be tested independently.

## Key elements

- **`workerTarget(requested, availableCpus)`** — Returns the worker count. Uses `requested` (from `NODE_CLUSTER_WORKERS`) when positive; otherwise falls back to `availableCpus` (from `os.availableParallelism()`). Never returns fewer than 1.
- **`CrashVerdict`** — Discriminated union: either `{ action: 'respawn', delayMs, recentCrashes }` or `{ action: 'give-up', recentCrashes }`.
- **`CrashPolicy`** — Interface of four tunables (all sourced from `NODE_CLUSTER_CRASH_*`): `windowMs`, `backoffBaseMs`, `backoffMaxMs`, `maxCrashes`.
- **`crashVerdict(history, now, policy)`** — Filters the crash history to the policy window, appends the current crash, and returns a verdict. Respawns with exponential backoff (`backoffBaseMs * 2^(n-1)`, capped at `backoffMaxMs`) or gives up when the windowed count exceeds `maxCrashes`. The returned `recentCrashes` array is the pruned history to pass on the next call.

## Relationships

- **`src/cluster.ts`** — The primary process that imports and calls these functions. It owns the actual `fork`/`exit` side effects; this file supplies only the decisions.
- **`tests/unit/infrastructure/runtime/cluster-policy.test.ts`** — Unit tests exercising `workerTarget` and `crashVerdict` in isolation (no process forking).

## Notes

- "Giving up" is intentional: it lets the primary exit so a container supervisor (e.g. Docker, k8s) can restart the whole process and fire alerts. Without it, a worker that dies at import would be respawned forever by a primary that never exits.
- `workerTarget` deliberately uses `os.availableParallelism()` rather than `os.cpus().length` to respect container CPU affinity.
- The `recentCrashes` field in the verdict is the *pruned* history (only entries within `windowMs`), so the caller can store it directly for the next call without re-filtering.
