---
source: src/cluster.ts
sha256: 80157a2dca012708927d3f5e238f77197dfa1d99abc0266f0a5a0139a4309007
generated_at: 2026-10-14T07:39:58.286085+00:00
model: ollama:qwen3.8:27b
---

# src/cluster.ts

## Purpose

The production entry point of the repository (referenced by `package.json`). It establishes the correct import order (dotenv → mongoose-boot → OTel) before any application module loads, then branches: the **primary** process forks and supervises worker processes, while each **worker** (or a single-process run) dynamically imports `./serve` to build and start the Express app.

## Key elements

- **`CLUSTER_ENABLED`** – Read once at import time from `clusterConfig().NODE_ENABLE_CLUSTERING`; decides whether this process acts as primary or worker. Deliberately not overridable after import.
- **`supervise()`** – The primary's entire responsibility: forks `workerTarget` workers, listens for `'exit'` events, applies crash-loop backoff via `crashVerdict`, schedules respawns, and runs a coordinated shutdown (SIGTERM → timeout → SIGKILL) on SIGTERM/SIGINT.
- **`startPrimaryShutdown(signal)`** – Kills all workers with SIGTERM, sets a force-kill timer (SIGKILL) if they don't exit within `NODE_CLUSTER_SHUTDOWN_TIMEOUT_MS`, and preserves a previously set `process.exitCode`.
- **`shouldRespawn(code, signal, exitedAfterDisconnect)`** – Returns `false` for clean exits (code 0), graceful signals (SIGTERM/SIGINT), or post-disconnect exits; `true` otherwise.
- **`scheduleRespawn(delayMs)` / `forkWorker()`** – Delayed respawn with `unref()`'d timers so they don't hold the event loop open; no-op during shutdown.
- **Entry fork** – `cluster.isPrimary && CLUSTER_ENABLED` → lazy `import('@app/config')` (config validation) then `supervise()`; otherwise `void import('./serve')` (side-effect only, builds and starts the app in the worker).

## Relationships

- **`src/infrastructure/config/dotenv.ts`** – Static-imported first; loads `.env` into `process.env` before any other module reads configuration.
- **`src/infrastructure/runtime/mongoose-boot.ts`** – Static-imported second; sets Mongoose connection defaults at schema-build time, before any model is loaded.
- **`src/infrastructure/runtime/otel-sdk.ts`** – `startTracing()` is invoked before any application module loads so the OTel SDK can patch `http`, Express, and Mongoose.
- **`src/infrastructure/runtime/config.ts`** – `clusterConfig()` supplies every cluster-related environment variable (worker count, crash window, backoff, shutdown timeout, crash limit).
- **`src/infrastructure/runtime/cluster-policy.ts`** – `workerTarget()` resolves the effective worker count; `crashVerdict()` computes backoff delay or a `give-up` verdict from the crash history.
- **`src/infrastructure/adapters/logger.ts`** – All structured log output from the primary and worker paths.

## Notes

- **Import order is load-bearing.** Static imports are hoisted above any statement, so `dotenv`, `mongoose-boot`, and `startTracing()` must be static imports at the top. The application code (`@app/config`, `./serve`) is loaded via dynamic `import()` to run *after* those setup steps.
- **`CLUSTER_ENABLED` is intentionally read once at import time.** No test harness or `createApp({ env })` call can change it after this module has been evaluated; the primary/worker split is final per process.
- **`process.exitCode ??= 0`** in the all-workers-exited branch: uses nullish assignment so a previously recorded failure code (from a crash loop or forced shutdown) is never overwritten by a success.
- **`// Stryker disable` comments** suppress mutation testing for log-only lines that have no observable side-effect beyond logging.
- **Respawn and force-shutdown timers are `unref()`'d** so the process can exit even if a pending timer has not fired.
