---
source: src/cluster.ts
sha256: 27c010540748493181bfde711024f41636b835c8918e92f255d98189b918d72f
generated_at: 2026-10-01T12:45:56.232523+00:00
model: ollama:qwen3.8:27b
---

# src/cluster.ts

## Purpose
Production entry point (per `package.json`) that enables Node.js clustering across CPU cores. It guarantees `.env` is loaded and OTel tracing is started **before** any application module is imported, then forks and supervises worker processes on the primary.

## Key elements
- **`startTracing()` call (module scope)** — Invoked immediately after importing `@infrastructure/runtime/otel-sdk`; must precede all app-module imports.
- **`CLUSTER_ENABLED`** — Boolean gate from `clusterConfig().NODE_ENABLE_CLUSTERING`; when false, the file falls through to the worker branch directly.
- **`supervise()`** — All primary-process logic: forks `workerTarget()` workers, listens for `cluster.on('exit')`, decides respawn vs. give-up via `crashVerdict()`, and handles coordinated shutdown.
- **`shouldRespawn()`** (inner) — Returns false for clean exits (code 0), intentional signals (SIGTERM/SIGINT), and post-disconnect exits.
- **`scheduleRespawn()`** (inner) — Sets an unref'd `setTimeout` that forks a replacement after the backoff delay returned by `crashVerdict`.
- **`startPrimaryShutdown()`** (inner) — Sends SIGTERM to all live workers, then SIGKILL after `shutdownTimeoutMs`; sets `process.exitCode = 1` on timeout.
- **Primary branch** — `void import('@app/config')` validates config once, then calls `supervise()`.
- **Worker branch** — `void import('./serve')` builds and starts the HTTP server (side-effect only).

## Relationships
- **`src/infrastructure/adapters/logger.ts`** — `logger` is used for every fork, exit, shutdown, and crash-respawn log line.
- **`src/infrastructure/runtime/cluster-policy.ts`** — `workerTarget()` resolves the actual worker count from config + `os.availableParallelism()`; `crashVerdict()` computes backoff delay or a "give-up" verdict based on the crash window and limits.
- **`src/infrastructure/runtime/config.ts`** — `clusterConfig()` reads all `NODE_CLUSTER_*` env vars and returns a typed object consumed by both the primary and policy functions.
- **`src/infrastructure/runtime/otel-sdk.ts`** — `startTracing()` is called at module top-level; the dynamic-import pattern below it exists specifically so this runs first.

## Notes
- **Import order is load-bearing.** `dotenv/config` → `startTracing()` → `void import('./serve')`. A static `import` of the app would be hoisted above the `startTracing()` call and silently skip instrumentation.
- **Config is validated on the primary only.** `assertProcessConfig()` runs before any worker is forked, so a bad env var produces one clean error rather than N workers crash-looping.
- **`process.exitCode ??= 0`** on clean shutdown uses nullish-assignment so a prior failure code (crash-loop give-up, forced timeout) is never overwritten.
- **All timers are `.unref()`'d** (respawn timers, force-shutdown timer) so they don't keep the event loop alive.
- **`crashHistory` is reset and repopulated** from `verdict.recentCrashes` after each crash, so the window is always the trimmed list the policy function expects on the next call.
