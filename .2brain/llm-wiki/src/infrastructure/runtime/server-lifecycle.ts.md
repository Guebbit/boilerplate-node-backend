---
source: src/infrastructure/runtime/server-lifecycle.ts
sha256: d518e6c3fdc508bba031d081c3a48413e5b8cf3f37b9a60803096ea9f49bdabe
generated_at: 2026-11-14T18:17:31.598852+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/server-lifecycle.ts

## Purpose

Orchestrates the server's full lifecycle: starting the HTTP listener, handling a failed boot, draining connections on shutdown, and tearing down every infrastructure adapter in a fixed, deterministic order. Enforces a global deadline so a stuck teardown cannot hang the process past the platform's SIGKILL window.

## Key elements

- **`listenOn(app, port, host?)`** — Promisified `Express.listen` that correctly rejects on bind errors (EADDRINUSE, EACCES). Works around an Express 5 quirk where the same callback receives both success and error.
- **`failBoot(error, stopFunction)`** — Calls the provided teardown, then `process.exit(1)`. Ensures a partially-booted process (e.g. connected to Mongo but never listened) actually exits so a restart policy can fire.
- **`closeServer(server)`** — Promisified `server.close()` with `closeIdleConnections()` called immediately and a `closeAllConnections()` cut at 50 % of the shutdown deadline (to free long-lived SSE streams and let later steps run).
- **`shutdownInfra(server?, settleInFlight?)`** — The ordered teardown chain: close server → `stopLocaleOverrideRefresh` → `settleRenders` → `settleIdempotencyMarks` → `settleInFlight` → `stopQueue` → `stopCache` → `stopLimitsRedis` → `stopDatabase` → `shutdownAnalytics` → `shutdownTracing`. Each step receives a time-slice of the global deadline.
- **`registerSignalHandlers(stopFunction)`** — Installs SIGTERM and SIGINT listeners. Marks the server as draining (readiness 503) before starting teardown, sets a forced-exit timer at the full deadline, and exits 0 on success / 1 on failure or timeout. Skipped in test environments.
- **`getShutdownTimeoutMs()`** — Reads `NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS` from server config (default 15 s).
- **Share constants** — `DRAIN_SHARE` (0.5), `RENDER_SHARE` (0.25), `IN_FLIGHT_SHARE` (0.1), `IDEMPOTENCY_SHARE` (0.05). Partition the deadline so each phase gets a bounded slice.

## Relationships

- **`src/app.ts`** — Caller: invokes `listenOn`, `failBoot`, `registerSignalHandlers`, and passes a `settleInFlight` closure into `shutdownInfra`.
- **`src/infrastructure/runtime/config.ts`** — Source of `isTestEnvironment()` and `serverConfig()` (provides the timeout value).
- **`src/infrastructure/runtime/readiness.ts`** — `markServerDraining()` flips the readiness probe to 503 the instant a shutdown signal arrives.
- **`src/infrastructure/runtime/database.ts`** — `stopDatabase()` is the second-to-last teardown step.
- **`src/infrastructure/runtime/otel-sdk.ts`** — `shutdownTracing()` is the very last step (flushes buffered spans).
- **`src/infrastructure/observability/analytics/index.ts`** — `shutdownAnalytics()` runs just before tracing (both buffer in memory).
- **`src/infrastructure/adapters/queue.ts`** — `stopQueue()` runs before cache so an in-flight job cannot reopen a closed cache connection.
- **`src/infrastructure/adapters/cache.ts`** — `stopCache()` runs after the queue.
- **`src/infrastructure/adapters/limits-redis.ts`** — `stopLimitsRedis()` runs after the general cache.
- **`src/infrastructure/adapters/pdf.ts`** — `settleRenders(timeoutMs)` waits for in-flight Chromium renders before the process can exit.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — `settleIdempotencyMarks(timeoutMs)` ensures pending done-marks are written before the database closes.
- **`src/infrastructure/i18n/index.ts`** — `stopLocaleOverrideRefresh()` stops the periodic locale refresh timer.
- **`src/infrastructure/adapters/logger.ts`** — `logger` used for all lifecycle log lines.

## Notes

- The shutdown deadline **must** stay below the platform's own grace period (Kubernetes `terminationGracePeriodSeconds` default 30 s; Docker `stop_grace_period` default 10 s). If it doesn't, the container is SIGKILLed mid-drain and the in-process timeout never fires.
- The ordering of teardown steps is deliberate: queue before cache (a running job would otherwise reopen a closed cache socket), stores before analytics/tracing (telemetry must capture the teardown), and idempotency marks before the database (a stranded key looks like a false "outcome unknown" to a do-not-retry client).
- Each `stop*` / `settle*` function is expected to swallow its own errors internally; the `.then()` chain does not insert per-step `.catch()`, so a single adapter's failure does not abort the remaining steps.
- All timers (`cutTimer`, `forcedExitTimer`) are `unref()`'d so they cannot independently keep the event loop alive after actual work completes.
- `registerSignalHandlers` is a no-op in test environments to avoid killing Jest's shared process when suites emit their own signals.
