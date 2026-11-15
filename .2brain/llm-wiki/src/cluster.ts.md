---
source: src/cluster.ts
sha256: 7a760f137b27907a98364357bb9deab807de0555f7d6c7c8d379e1f7677536ca
generated_at: 2026-11-14T17:50:08.415508+00:00
model: ollama:qwen3.8:27b
---

# src/cluster.ts

## Purpose

Entry point for `npm run start:cluster` on a bare VM (no PM2/systemd). Uses Node's `cluster` module to fork worker processes, supervise their lifecycle (respawn on crash with backoff, coordinated graceful shutdown), and serve HTTP in each worker. Not the default entry — containers scale via `--scale app=N` instead.

## Key elements

- **`CLUSTER_ENABLED`** — read once at module load from `clusterConfig().NODE_ENABLE_CLUSTERING`; decides primary vs. worker path.
- **`supervise()`** — primary-process loop: forks `workerTarget` workers, listens for `cluster.on('exit')`, applies `crashVerdict` backoff, and drives coordinated shutdown (SIGTERM → timeout → SIGKILL).
- **Entry fork (bottom)** — if `cluster.isPrimary && CLUSTER_ENABLED`, lazily imports `@app/config` to validate config once, then calls `supervise()`. Otherwise (worker or single-process) dynamically imports `./serve`.
- **Import ordering (top)** — `dotenv` → `mongoose-boot` → `startTracing()` before any other module loads, so Mongoose defaults and OTel patches are in place before express/mongoose schemas are evaluated.

## Relationships

- **`src/infrastructure/config/dotenv.ts`** — imported first; loads the `.env` file into the process environment before any other module reads configuration.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — imported second; sets Mongoose connection defaults before any model/schema is built.
- **`src/infrastructure/runtime/otel-sdk.ts`** — `startTracing()` is called immediately after import; must precede all other module loads so OTel can patch http/express/mongoose.
- **`src/infrastructure/runtime/config.ts`** — `clusterConfig()` supplies every `NODE_CLUSTER_*` value (worker count, crash window, backoff bounds, shutdown timeout, crash limit).
- **`src/infrastructure/runtime/cluster-policy.ts`** — `workerTarget()` resolves the effective worker count from the configured value and system parallelism; `crashVerdict()` computes a backoff delay or a give-up decision from the crash history.
- **`src/infrastructure/adapters/logger.ts`** — the `logger` export is used throughout for structured logging of fork, exit, crash, and shutdown events.

## Notes

- `CLUSTER_ENABLED` is a module-level constant. There is no runtime toggle and no test can override it after import — the primary/worker split is decided exactly once per process.
- The primary deliberately lazy-imports `@app/config` (and `./serve`) so that a misconfigured variable produces one clean error in the primary rather than every worker crash-looping.
- `process.exitCode ??= 0` on the final worker exit preserves a failure code already set by a crash-loop give-up or a forced shutdown.
- Respawn timers are `unref()`-ed so they don't hold the event loop open during shutdown.
- The `// Stryker disable` comments are for mutation-testing coverage, not runtime behavior.
