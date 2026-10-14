---
source: src/infrastructure/runtime/server-lifecycle.ts
sha256: 7fe8f63c5d7ab5f11270736c354f3a855507f088c8b22272f2976e342e6ed13e
generated_at: 2026-10-14T08:15:21.785746+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/server-lifecycle.ts

## Purpose

Orchestrates the full server lifecycle: binding an Express app to a port, and — on shutdown — draining in-flight connections and tearing down infrastructure adapters in a fixed, safe order. All timers are `unref`'d so none independently hold the event loop open, and every step carries a hard deadline (default 15 s) so a stuck teardown cannot hang the process past the orchestrator's SIGKILL window.

## Key elements

- **`getShutdownTimeoutMs()`** — Reads `NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS` from `serverConfig()`; the single source of truth for every timeout split in this file.
- **`listenOn(app, port, host?)`** — Promisified `app.listen` that distinguishes bind errors (EADDRINUSE, EACCES) from success, working around Express 5's shared callback signature.
- **`failBoot(error, stopFunction)`** — Calls the provided teardown (tolerating its failure), then `process.exit(1)` so a restart policy actually fires.
- **`closeServer(server)`** — Promisified `server.close()` that immediately closes idle keep-alive sockets and schedules `closeAllConnections()` at 50 % of the deadline to cut long-lived (e.g. SSE) streams.
- **`shutdownInfra(server?, settleInFlight?)`** — The main shutdown chain: close server → stop locale-override refresh → settle in-flight PDF renders → settle caller's in-flight work → stop queue → stop cache → stop limits-Redis → stop database → shutdown analytics → shutdown tracing. Each `.then` swallows its own error so one broken adapter cannot block the rest.
- **`registerSignalHandlers(stopFunction)`** — Installs SIGTERM/SIGINT listeners. On signal: marks the server draining (`markServerDraining`), starts a forced-exit timer, runs `stopFunction`, then exits 0 on success or 1 on failure. Skipped entirely in test environments.

## Relationships

- **`src/serve.ts`** — Entry point that calls `listenOn`, passes its failure to `failBoot`, and registers `registerSignalHandlers` wrapping `shutdownInfra`.
- **`src/app.ts`** — Produces the Express `app` instance handed to `listenOn`; its internal `stop` closure is the `stopFunction` passed to `failBoot`.
- **`src/infrastructure/runtime/config.ts`** — Supplies `serverConfig()` (timeout value) and `isTestEnvironment()` (signal-handler guard).
- **`src/infrastructure/runtime/readiness.ts`** — `markServerDraining()` flips `/readyz` to 503 the instant a shutdown signal arrives, before `server.close()` runs.
- **`src/infrastructure/runtime/database.ts`** — `stopDatabase()` is the fourth-to-last step in the shutdown chain.
- **`src/infrastructure/adapters/cache.ts`** — `stopCache()` runs after the queue so a still-running job cannot reopen a just-closed connection.
- **`src/infrastructure/adapters/limits-redis.ts`** — `stopLimitsRedis()` runs after the cache.
- **`src/infrastructure/adapters/queue.ts`** — `stopQueue()` runs before cache (see above).
- **`src/infrastructure/adapters/pdf.ts`** — `settleRenders(timeoutMs)` gives in-flight Chromium renders time to finish before their temp profiles are orphaned.
- **`src/infrastructure/i18n/index.ts`** — `stopLocaleOverrideRefresh()` halts the periodic refresh loop first, so no locale write lands after stores close.
- **`src/infrastructure/observability/analytics/index.ts`** — `shutdownAnalytics()` is second-to-last so buffered events from the teardown steps above are still captured.
- **`src/infrastructure/runtime/otel-sdk.ts`** — `shutdownTracing()` is the very last step for the same buffering reason.
- **`src/infrastructure/adapters/logger.ts`** — `logger` is used throughout for structured error/info logging during boot, drain, and forced-exit paths.

## Notes

- **Deadline splits are proportional, not absolute.** `DRAIN_SHARE` (0.5), `RENDER_SHARE` (0.25), and `IN_FLIGHT_SHARE` (0.1) each claim a fraction of the same configurable total; they are deliberately summing to < 1 so the store-closure steps still get time.
- **Shutdown order is intentional and load-bearing.** Queue before cache (avoids reopening a closed connection), analytics/tracing last (they buffer in memory and must flush records written by every preceding step). Reordering without updating both the code and the JSDoc will silently drop telemetry or orphan connections.
- **`unref()` on every timer is load-bearing.** Without it, a pending `setTimeout` would keep the event loop alive after a clean `process.exit` path has already fired, producing zombie containers in CI.
- **Signal handlers are a no-op under Jest** (`isTestEnvironment()`), because multiple suites share one process and Jest itself sends signals; installing `process.exit` handlers there would kill the runner mid-run.
- **The forced-exit timer uses `process.exit(1)`, not `process.kill`.** This guarantees the non-zero exit code is recorded by the orchestrator even if a lingering handle would otherwise prevent a natural exit.
