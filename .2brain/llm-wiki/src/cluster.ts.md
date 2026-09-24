---
source: src/cluster.ts
sha256: 7f193d131f4f8f409cb8508afe2f6bf847d631b394f27c0addb5ab8129d9ab73
generated_at: 2026-09-23T17:36:49.156926+00:00
model: ollama:qwen3.8:27b
---

# src/cluster.ts

## Purpose

Entry point of the repository (set as `main` in `package.json`). It bootstraps OpenTelemetry tracing, then either forks a configurable number of `node:cluster` workers (primary role) or delegates to `./app` (worker role). It exists so the application can scale across CPU cores and survive transient worker crashes without manual restart.

## Key elements

- **`startTracing()` call** — imported and invoked at the very top, before any other module loads, to ensure OTel context is available process-wide.
- **`CLUSTER_ENABLED`** — resolved from `NODE_ENABLE_CLUSTERING` (default `false`); gates the entire primary/worker branching.
- **`getWorkerTarget()`** — reads `NODE_CLUSTER_WORKERS` (default `os.cpus().length`) and clamps the result to ≥ 1.
- **Crash-loop backoff logic** (`cluster.on('exit')`) — tracks crash timestamps in a sliding window (`NODE_CLUSTER_CRASH_WINDOW_MS`, default 60 s) and respawns with exponential backoff (`NODE_CLUSTER_CRASH_BACKOFF_BASE_MS` → `NODE_CLUSTER_CRASH_BACKOFF_MAX_MS`).
- **`startPrimaryShutdown(signal)`** — sends `SIGTERM` to all workers, waits `NODE_CLUSTER_SHUTDOWN_TIMEOUT_MS` (default 15 s), then force-kills stragglers with `SIGKILL`.
- **Worker branch** — the `else` path simply `void import('./app')`, so workers run the same application code the primary would.

## Relationships

- **`@infrastructure/runtime/otel-sdk`** — `startTracing()` is called immediately on module load; this is a hard ordering dependency (tracing must be active before the cluster or app code runs).
- **`@infrastructure/adapters/logger`** — all structured log output (info/warn) in the primary process goes through the shared `logger` instance.
- **`@infrastructure/runtime/environment`** — `environmentFlag` and `environmentNumber` are the sole accessors for every `NODE_*` tuning knob in this file; no direct `process.env` reads.

## Notes

- The OTel import is intentionally placed above all other imports. Reordering will silently break tracing context for the rest of the module.
- `scheduleRespawn` uses `timer.unref()` so pending respawn timers don't keep the primary process alive after an intentional shutdown.
- The Stryker mutation-testing disable/restore comments around log lines are intentional — those lines are expected to be "trivial" for mutation scoring; do not remove them when refactoring.
- If you don't need multi-core scaling, swap the `main` field in `package.json` to `app.ts` (as noted in the file header comment) and skip this module entirely.
- `crashHistory` is a plain in-memory array; it does not survive a primary restart.
