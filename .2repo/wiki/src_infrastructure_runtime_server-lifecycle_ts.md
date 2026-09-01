# src/infrastructure/runtime/server-lifecycle.ts

## Purpose

Orchestrates graceful shutdown of the Node.js process: stops accepting traffic, drains in-flight connections, then tears down infrastructure adapters in a fixed sequence. Introduces a hard deadline so a hung teardown cannot block the orchestrator's restart cycle. Decoupled from Express routing — it only sequences the `stop*` calls each adapter already exposes.

## Key elements

- **`getShutdownTimeoutMs()`** — Reads `NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS` env var; falls back to 15 s and guards against `NaN` from malformed input.
- **`closeServer(server)`** — Promisifies `http.Server.close()`, resolving once all in-flight sockets are drained.
- **`shutdownInfra(server?)`** — Chains the full teardown in order: close server → `stopLocaleOverrideRefresh` → `stopCache` → `stopRateLimitStore` → `stopQueue` → `stopDatabase` → `shutdownAnalytics` → `shutdownTracing`. Accepts an optional server so non-HTTP entry points (workers, CLI) can call the same path.
- **`registerSignalHandlers(stopFunction)`** — Attaches `SIGTERM`/`SIGINT` listeners that invoke the supplied stop function, enforce the timeout via a `setTimeout` + `unref()` guard, and explicitly call `process.exit(0|1)`. Skips registration entirely when `NODE_ENV === 'test'`.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports `logger` for structured info/error logging at every shutdown milestone.
- **`src/infrastructure/runtime/database.ts`** — Calls `stopDatabase()` after all traffic-facing stores are closed.
- **`src/infrastructure/adapters/cache.ts`** — Calls `stopCache()` early in the chain (before queue and database).
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — Calls `stopRateLimitStore()` between cache and queue.
- **`src/infrastructure/adapters/queue.ts`** — Calls `stopQueue()` after rate-limit store, before database.
- **`src/infrastructure/i18n/index.ts`** — Calls `stopLocaleOverrideRefresh()` immediately after server drain, before any data-store teardown.
- **`src/infrastructure/observability/analytics/index.ts`** — Calls `shutdownAnalytics()` near the end so in-memory buffers capture the teardown steps above them.
- **`src/infrastructure/runtime/otel-sdk.ts`** — Calls `shutdownTracing()` last in the chain (same buffering rationale as analytics).
- **`src/app.ts`** — Expected caller: constructs the `stopFunction` closure (wrapping `shutdownInfra` + the bound `Server`) and passes it to `registerSignalHandlers`.

## Notes

- **Timeout vs. platform grace period:** The 15 s default must stay below the orchestrator's kill deadline (K8s `terminationGracePeriodSeconds` default 30 s; Docker `stop_grace_period` default 10 s). If it exceeds that, the container is SIGKILLed before the local timer fires.
- **Failure isolation:** Each `.then()` step is expected to swallow its own errors internally; a broken adapter (e.g., Redis down) should not prevent subsequent steps (e.g., database close) from running.
- **Explicit `process.exit`:** `exit(0)` is called after successful shutdown because Otel timers, driver sockets, and other handles can keep the event loop alive indefinitely otherwise. `unref()` on the forced-exit timer prevents that timer from being the reason the process stays alive during a clean shutdown.
- **`server?.listening` guard:** `closeServer` is skipped when the server was never bound or already closed, avoiding a spurious rejection.
- **Test mode:** `registerSignalHandlers` is a no-op under `NODE_ENV === 'test'` to prevent `process.exit` calls from killing the Jest worker.
