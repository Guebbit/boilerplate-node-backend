---
source: src/infrastructure/runtime/server-lifecycle.ts
sha256: 20f10f7cad9152b4ce364df60e35bb357107dc429d5a17407c7161bbeb490afc
generated_at: 2026-11-08T03:47:57.499651+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/server-lifecycle.ts

## Purpose

Orchestrates the full server lifecycle: binding, listening, and—most critically—graceful shutdown. It sequences stop-calls for every infrastructure adapter in a fixed, dependency-aware order, imposes a global deadline so a stuck teardown cannot hang the process, and registers signal handlers (`SIGTERM`/`SIGINT`) that trigger that sequence. It does not know *how* any adapter stops; it only decides *when*.

## Key elements

- **`listenOn(app, port, host?)`** — Promisified `app.listen` that correctly rejects on bind errors (Express 5 passes bind errors to the same callback as success). Resolves with the `http.Server` once listening.
- **`failBoot(error, stopFunction)`** — Logs the error, runs a partial teardown, then calls `process.exit(1)`. Ensures a process that connected to a store but never listened actually exits so restart policies can act.
- **`closeServer(server)`** — Promisified `server.close()`. Immediately closes idle keep-alive sockets, and sets an `unref()`-ed timer (`DRAIN_SHARE` × deadline) to call `server.closeAllConnections()` so long-lived responses (SSE) cannot block the shutdown.
- **`shutdownInfra(server?, settleInFlight?)`** — The core teardown chain. Order: close/drain server → stop locale-override refresh → settle in-flight PDF renders (`RENDER_SHARE`) → settle caller's in-flight work (`IN_FLIGHT_SHARE`) → stop queue → stop cache → stop limits-redis → stop database → shutdown analytics → shutdown tracing. Each step swallows its own errors so one broken adapter cannot block the rest.
- **`registerSignalHandlers(stopFunction)`** — Installs `SIGTERM`/`SIGINT` listeners. On signal: marks the server draining (readiness probes return 503 immediately), runs `stopFunction()` on a microtask, then `exit(0)` or `exit(1)`. A forced-exit timer (`unref()`-ed) kills the process if the deadline passes. No-ops in test environments.
- **`getShutdownTimeoutMs()`** — Reads `NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS` from config (default 15 s). Must stay below the platform's grace period (K8s 30 s, Docker 10 s).
- **Internal constants** — `DRAIN_SHARE` (0.5), `RENDER_SHARE` (0.25), `IN_FLIGHT_SHARE` (0.1): fractions of the deadline allotted to each phase.

## Relationships

- **`src/serve.ts`** — Entry point that calls `listenOn`, `registerSignalHandlers`, and wires `shutdownInfra` as the stop function.
- **`src/app.ts`** — Produces the Express `app` passed to `listenOn` and supplies the `stopFunction` (its own internal teardown) to `failBoot` and `registerSignalHandlers`.
- **`src/infrastructure/runtime/config.ts`** — Provides `serverConfig()` (timeout value) and `isTestEnvironment()` (gate for signal-handler registration).
- **`src/infrastructure/runtime/readiness.ts`** — `markServerDraining()` flips readiness to 503 the instant a signal is received, before `server.close()` runs.
- **`src/infrastructure/runtime/database.ts`** — `stopDatabase()` is the second-to-last infra step in `shutdownInfra`.
- **`src/infrastructure/adapters/cache.ts`** — `stopCache()` runs after the queue (a running job would otherwise reopen a just-closed cache connection).
- **`src/infrastructure/adapters/limits-redis.ts`** — `stopLimitsRedis()` follows cache teardown.
- **`src/infrastructure/adapters/queue.ts`** — `stopQueue()` runs before cache to avoid the reopen race above.
- **`src/infrastructure/adapters/pdf.ts`** — `settleRenders(timeoutMs)` lets in-flight Chromium renders finish before the process exits, preventing orphaned browsers.
- **`src/infrastructure/i18n/index.ts`** — `stopLocaleOverrideRefresh()` halts the periodic override-refresh loop right after server drain.
- **`src/infrastructure/observability/analytics/index.ts`** — `shutdownAnalytics()` flushes buffered events; runs second-to-last so it captures logs from the steps above.
- **`src/infrastructure/runtime/otel-sdk.ts`** — `shutdownTracing()` is the final step, exporting spans generated during teardown.
- **`src/infrastructure/adapters/logger.ts`** — `logger` is used for all lifecycle log lines (error on boot failure, info on signal, error on timeout/failure).

## Notes

- **Express 5 quirk:** `app.listen` delivers bind errors (EADDRINUSE, EACCES) to the same callback as success. `listenOn` handles this explicitly; a naive callback that ignores its argument would resolve a "listening" promise on a socket that never opened.
- **Deadline vs. platform grace:** The 15 s internal timeout must stay *below* the orchestrator's `terminationGracePeriodSeconds` / `stop_grace_period`, or the platform SIGKILLs the container before the timeout fires.
- **`unref()` on timers:** Both the drain-cut timer and the forced-exit timer are `unref()`-ed so they cannot independently keep the event loop alive after real work is done.
- **Explicit `process.exit(0)`:** Lingering handles (OTel periodic timers, driver sockets) can otherwise prevent natural exit; the explicit call guarantees the process dies.
- **Test-environment guard:** `registerSignalHandlers` is a no-op under Jest to avoid killing the test runner when it emits its own signals.
- **`shutdownInfra` is server-optional:** Workers and CLI entry points call it without an `http.Server`; the `Promise.resolve(server)` idiom normalizes the chain so the first `.then` simply no-ops when `s` is `undefined`.
