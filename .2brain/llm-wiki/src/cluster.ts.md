---
source: src/cluster.ts
sha256: 7e2feebb0104de8015cdd455b09d8b2af227685947e0d9d45374b80b9909cc34
generated_at: 2026-10-29T01:51:32.858306+00:00
model: ollama:qwen3.8:27b
---

# src/cluster.ts

## Purpose

The application's main entry point (referenced by `package.json`). It orchestrates Node.js process clustering: the primary forks and supervises workers, while each worker boots the HTTP server. Critically, it also enforces a strict initialization order — environment variables, Mongoose defaults, and OpenTelemetry tracing — before any application module is loaded.

## Key elements

- **Static import block (top):** Imports `dotenv` (loads `.env`), `mongoose-boot` (sets Mongoose defaults), and `startTracing()` (initializes OTel SDK) in that order. These must run before any express/http/mongoose module is loaded because OTel patches them.
- **`CLUSTER_ENABLED`:** Read once at module load from `clusterConfig().NODE_ENABLE_CLUSTERING`. No runtime override is possible by design.
- **`supervise()`:** The primary-process loop. Forks N workers, listens for `cluster` exit events, applies exponential-backoff respawning via `crashVerdict`, and performs coordinated shutdown (SIGTERM → grace timeout → SIGKILL).
- **Entry fork (bottom):** If `cluster.isPrimary && CLUSTER_ENABLED`, lazily imports `@app/config` to validate configuration, then calls `supervise()`. Otherwise (worker or single-process) dynamically imports `./serve` to start the server.
- **`shouldRespawn(code, signal, exitedAfterDisconnect)`:** Decides whether a worker exit warrants a respawn (skips clean exits, intentional kills, and post-disconnect exits).
- **`startPrimaryShutdown(signal)`:** Sends SIGTERM to all workers, starts a force-kill timer, and marks the process as shutting down.

## Relationships

- **`src/infrastructure/config/dotenv.ts`** — Imported first; populates `process.env` so every subsequent import can read its configuration.
- **`src/infrastructure/runtime/mongoose-boot.ts`** — Imported before any model/schema module; sets connection-time Mongoose defaults.
- **`src/infrastructure/runtime/otel-sdk.ts`** — `startTracing()` is called immediately after its import; must precede express/mongoose loading because it patches their I/O.
- **`src/infrastructure/runtime/config.ts`** — `clusterConfig()` is the single source for all `NODE_CLUSTER_*` env vars (worker count, crash window, backoff, shutdown timeout).
- **`src/infrastructure/runtime/cluster-policy.ts`** — `workerTarget()` resolves the final worker count; `crashVerdict()` computes backoff delay or a "give-up" verdict from the crash history.
- **`src/infrastructure/adapters/logger.ts`** — All structured logging in this file goes through its `logger` export.

## Notes

- **Import order is load-bearing.** Static imports are hoisted above all statements, so the application (`@app/config`, `./serve`) is always imported *dynamically* (`import()`) to sit after `startTracing()`. A future refactor that converts these to static imports will silently break tracing.
- **`CLUSTER_ENABLED` is immutable after import.** There is no API to toggle clustering at runtime; the decision is final at process start.
- **Primary validates config *before* forking.** This is intentional: a bad variable produces one clean error rather than every worker crash-looping on the same bad value.
- **`process.exitCode ??= 0`** in the all-workers-exited branch: uses nullish assignment so a failure code already set (crash-loop give-up, forced timeout) is not overwritten by a "clean" zero.
- **Stryker `disable`/`restore` comments** mark log-statement lines that mutation testing would otherwise flag as redundant; they are not functional code.
- Workers manage their own signal handling inside `./serve`; the primary's SIGTERM handler only orchestrates the *group* shutdown.
