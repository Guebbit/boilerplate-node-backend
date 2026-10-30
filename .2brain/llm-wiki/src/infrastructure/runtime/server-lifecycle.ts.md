---
source: src/infrastructure/runtime/server-lifecycle.ts
sha256: 20f10f7cad9152b4ce364df60e35bb357107dc429d5a17407c7161bbeb490afc
generated_at: 2026-10-29T02:15:23.702608+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/server-lifecycle.ts

## Purpose

Orchestrates the full server lifecycle — binding, graceful shutdown, and forced-exit deadlines. It sequences the `stop`/`shutdown` calls each adapter already exposes in a fixed order with a configurable timeout, without knowing *how* any adapter stops. Decoupled from Express middleware and route mounting.

## Key elements

- **`listenOn(app, port, host?)`** — Wraps Express 5's callback-style `app.listen` in a promise that resolves with the `Server` or rejects on a bind error (EADDRINUSE, EACCES). Handles the two-argument vs three-argument signature.
- **`failBoot(error, stopFunction)`** — Called when startup fails partway. Runs the provided teardown, then calls `process.exit(1)` so the orchestrator's restart policy kicks in.
- **`closeServer(server)`** — Promisifies `http.Server.close()`. Immediately closes idle keep-alive sockets via `closeIdleConnections()`, and schedules `closeAllConnections()` at half the deadline to cut long-lived responses (e.g. SSE streams) so downstream stores still get their close window.
- **`shutdownInfra(server?, settleInFlight?)`** — The main graceful-shutdown chain: close server → stop locale-override refresh → settle in-flight PDF renders → settle caller's in-flight work → stop queue → stop cache → stop limits-redis → stop database → shutdown analytics → shutdown tracing. Each step swallows its own failure.
- **`registerSignalHandlers(stopFunction)`** — Installs `SIGTERM`/`SIGINT` listeners. On signal: marks server draining (readiness endpoint flips to 503), starts a forced-exit timer (unref'd), runs `stopFunction`, then exits 0 or 1. Skipped entirely in test environments.
- **`getShutdownTimeoutMs()`** (internal) — Reads `NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS` from `serverConfig()` (default 15 s).
- **`DRAIN_SHARE` / `RENDER_SHARE` / `IN_FLIGHT_SHARE`** (internal) — Constants (0.5 / 0.25 / 0.1) that partition the deadline among server drain, PDF render settlement, and caller in-flight work.

## Relationships

- **`src/serve.ts`** — Primary caller: invokes `listenOn`, `failBoot`, `registerSignalHandlers`, and passes a `stopFunction` closure that wraps `shutdownInfra`.
- **`src/app.ts`** — Supplies the Express `app` and the `stop` function handed to `failBoot`.
- **`src/infrastructure/adapters/queue.ts`** — `stopQueue()` is called before `stopCache()` to avoid a running job reopening a just-closed cache connection.
- **`src/infrastructure/adapters/cache.ts`** — `stopCache()` after the queue.
- **`src/infrastructure/adapters/limits-redis.ts`** — `stopLimitsRedis()` after cache.
- **`src/infrastructure/runtime/database.ts`** — `stopDatabase()` after the Redis adapters.
- **`src/infrastructure/observability/analytics/index.ts`** — `shutdownAnalytics()` near the end (buffers in memory; must capture the teardown above it).
- **`src/infrastructure/runtime/otel-sdk.ts`** — `shutdownTracing()` is the last step.
- **`src/infrastructure/adapters/pdf.ts`** — `settleRenders(timeoutMs)` ensures in-flight Chromium renders finish or time out before exit.
- **`src/infrastructure/i18n/index.ts`** — `stopLocaleOverrideRefresh()` stops the periodic refresh timer early in shutdown.
- **`src/infrastructure/adapters/logger.ts`** — `logger` used for all lifecycle log messages.
- **`src/infrastructure/runtime/config.ts`** — `serverConfig()` for the timeout value; `isTestEnvironment()` to skip signal-handler registration under Jest.
- **`src/infrastructure/runtime/readiness.ts`** — `markServerDraining()` flips `/readyz` to 503 the instant a signal is received, before `server.close()`.

## Notes

- **Deadline vs. platform grace period:** `NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS` must stay below Kubernetes `terminationGracePeriodSeconds` (default 30 s) and Docker `stop_grace_period` (default 10 s); otherwise the platform SIGKILLs the container before the forced-exit timer fires.
- **Shutdown order is deliberate:** queue → cache → limits-redis → database → analytics → tracing. Analytics and tracing are last because they buffer spans/events in memory and must flush the teardown performed by the steps above.
- **All timers are `unref()`'d** so they never keep the event loop alive on their own.
- **`process.exit(0)` is called explicitly** after successful shutdown because lingering handles (OTel periodic readers, driver sockets) can otherwise keep the process alive past the real shutdown.
- **Signal handler uses `void` on a floating promise** because Node ignores a returned promise from a signal listener; the `void` documents the intent.
- **`closeServer` calls `closeIdleConnections()` synchronously** before awaiting the `close` callback, so idle keep-alive sockets don't hold the drain open.
