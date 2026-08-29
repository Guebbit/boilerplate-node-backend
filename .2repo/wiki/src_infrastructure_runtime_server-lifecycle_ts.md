# src/infrastructure/runtime/server-lifecycle.ts

## Purpose

Single-responsibility module for graceful server startup sequencing and shutdown orchestration. It owns the shutdown ordering, the signal-handling wiring, and the forced-exit deadline—deliberately kept separate from Express middleware and route mounting so that the "how to stop" logic is isolated from the "what to serve" logic.

## Key elements

- **`getShutdownTimeoutMs()`** — Reads `NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS` from the environment; falls back to 15 000 ms. Guards against `NaN` (garbage env values) that would otherwise make the safety timer fire instantly.
- **`closeServer(server)`** — Promisifies `http.Server.close()`, resolving only after all in-flight keep-alive sockets have drained. Rejects if the server was never listening.
- **`shutdownInfra(server?)`** — Sequential teardown chain (server → locale-override refresh → cache → rate-limit store → queue → database → analytics → tracing). Each step swallows its own errors so a failure in one adapter never blocks the rest. Works with or without a `Server` argument (workers / CLI entry points).
- **`registerSignalHandlers(stopFunction)`** — Installs `SIGTERM` and `SIGINT` listeners. On signal it runs `stopFunction()`, exits 0 on success / 1 on failure, and sets an unref'd `setTimeout` deadline (from `getShutdownTimeoutMs()`) that forces `process.exit(1)` if teardown hangs. Skipped entirely when `NODE_ENV === 'test'`.

## Relationships

- **`@infrastructure/adapters/logger`** — Emits structured info/error logs at every lifecycle transition (signal received, timeout fired, success, failure).
- **`@infrastructure/runtime/database`** — Calls `stopDatabase()` as the fifth teardown step.
- **`@infrastructure/adapters/cache`** — Calls `stopCache()` (third step); the comment notes the Redis subscriber must stop before the client.
- **`@infrastructure/adapters/queue`** — Calls `stopQueue()` (fourth step).
- **`@infrastructure/http/middlewares/rate-limit-store`** — Calls `stopRateLimitStore()` between cache and queue.
- **`@infrastructure/i18n`** — Calls `stopLocaleOverrideRefresh()` first after the server closes.
- **`@infrastructure/observability/analytics`** — Calls `shutdownAnalytics()` (second-to-last) so in-memory event buffers flush *after* the services they observed have stopped.
- **`@infrastructure/runtime/otel-sdk`** — Calls `shutdownTracing()` last, capturing spans that span the entire teardown.
- **`src/app.ts`** — Expected consumer: creates the `Server`, calls `registerSignalHandlers` with a closure over `shutdownInfra`, and passes the bound server into `shutdownInfra`.

## Notes

- **Timeout vs. platform grace period.** The shutdown deadline must stay *below* the orchestrator's grace window (Kubernetes `terminationGracePeriodSeconds` defaults to 30 s; Docker `stop_grace_period` defaults to 10 s). If it exceeds that, the platform sends `SIGKILL` mid-drain and the graceful path is never observed.
- **Shutdown order is intentional.** Resources that other resources depend on (subscriber → client, request stores → analytics/tracing buffers) are stopped first; in-memory buffers are stopped last so they can record the teardown of everything else.
- **`forcedExitTimer.unref()`** prevents the pending timeout from keeping the event loop alive after a clean exit.
- **Explicit `process.exit(0)`** is required after successful shutdown because Otel SDK timers and driver sockets may otherwise hold the event loop open indefinitely.
- **Test safety.** `registerSignalHandlers` is a no-op under `NODE_ENV === 'test'` to avoid killing the Jest runner with `process.exit` calls.
