---
source: src/infrastructure/runtime/server-lifecycle.ts
sha256: f1a7110f4f9c175fe7b371619c81b017ec803b5f2a8b42be0da4f1162547c8c6
generated_at: 2026-09-27T14:15:51.461173+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/server-lifecycle.ts

## Purpose

Sequences the full server lifecycle beyond startup: binding the HTTP listener, handling a failed boot, and orchestrating graceful shutdown of the server and every infrastructure adapter in a fixed order under a configurable deadline. It is transport-agnostic — it calls each adapter's own `stop`/`shutdown` function without knowing its internals.

## Key elements

- **`getShutdownTimeoutMs()`** – Reads `NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS` (min 1 ms) via `environmentNumber`, falling back to 15 000 ms. Must stay below the orchestrator's `terminationGracePeriodSeconds`.
- **`listenOn(app, port, host?)`** – Promisified `app.listen` that correctly rejects on bind errors (Express 5 passes the error to the success callback). Resolves with the `http.Server` instance.
- **`failBoot(error, stopFunction)`** – Logs the error, runs the partial teardown, then `process.exit(1)` so restart policies engage.
- **`closeServer(server)`** – Promisified `server.close()`. Immediately closes idle keep-alive sockets; sets an `unref`'d timer at 50 % of the deadline to force-close remaining connections (e.g. SSE streams) so downstream stores still get to close.
- **`shutdownInfra(server?)`** – The full teardown chain in fixed order: close server → `stopLocaleOverrideRefresh` → `settleRenders` → `stopQueue` → `stopCache` → `stopRateLimitStore` → `stopDatabase` → `shutdownAnalytics` → `shutdownTracing`. Each step swallows its own rejection so one failure cannot block the rest.
- **`registerSignalHandlers(stopFunction)`** – Installs `SIGTERM` and `SIGINT` listeners. On signal: marks the server draining (`markServerDraining`), starts an `unref`'d forced-exit timer, runs `stopFunction`, then exits 0 or 1. Skipped entirely when `NODE_ENV === 'test'`.
- **`DRAIN_SHARE` (0.5)** / **`RENDER_SHARE` (0.25)** – Partition the total deadline so server drain, PDF render settlement, and infra teardown each get a bounded window before forced exit.

## Relationships

- **`src/serve.ts`** – The process entry point; calls `listenOn` to start serving and `registerSignalHandlers` to wire shutdown.
- **`src/app.ts`** – Builds the Express app and its own `stop` closure, which is passed to `failBoot` and (indirectly) to the signal handlers.
- **`src/infrastructure/runtime/readiness.ts`** – `markServerDraining()` flips `/readyz` to 503 the instant a shutdown signal arrives, ahead of connection drain.
- **`src/infrastructure/runtime/environment.ts`** – Provides `environmentNumber` for validated numeric env reads.
- **`src/infrastructure/runtime/otel-sdk.ts`** – `shutdownTracing()` is the *last* step in `shutdownInfra` so spans covering the entire teardown are flushed.
- **`src/infrastructure/observability/analytics/index.ts`** – `shutdownAnalytics()` runs second-to-last; both analytics and tracing buffer in memory and must capture events from the adapters they instrument.
- **`src/infrastructure/runtime/database.ts`** – `stopDatabase()` is called after all higher-level stores that depend on it.
- **`src/infrastructure/adapters/queue.ts`** – `stopQueue()` is deliberately called *before* `stopCache()` so an in-flight job cannot re-open the cache connection it just lost.
- **`src/infrastructure/adapters/cache.ts`** – `stopCache()` closes the Redis (or equivalent) connection.
- **`src/infrastructure/adapters/pdf.ts`** – `settleRenders()` waits for (or times out) in-flight Chromium renders; exiting mid-render would orphan the browser process and its temp profile.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** – `stopRateLimitStore()` releases the rate-limit backend.
- **`src/infrastructure/i18n/index.ts`** – `stopLocaleOverrideRefresh()` stops the periodic locale-refresh interval.
- **`src/infrastructure/adapters/logger.ts`** – All log calls in this file go through the shared `logger`.

## Notes

- **Shutdown order is load-bearing.** Queue before cache (prevents re-open), database before analytics/tracing (they must see the DB-stop events), analytics before tracing (tracing is the outermost instrumentation layer). Reordering breaks the invariants documented in the chain.
- **Every timer is `unref`'d.** Both the connection-cut timer in `closeServer` and the forced-exit timer in `registerSignalHandlers` must not independently keep the event loop alive once real work is done.
- **Explicit `process.exit`** is used on both the success (`exit(0)`) and failure (`exit(1)`) paths after shutdown, because OTel background timers and driver sockets can otherwise hold the loop open indefinitely.
- **Express 5 `listen` quirk:** the callback receives a bind error in the same position as the success call, so `listenOn` inspects the argument rather than relying on the callback being a separate "error" callback.
- **Jest guard:** `registerSignalHandlers` is a no-op under `NODE_ENV === 'test'` to avoid killing the test runner's process when Jest dispatches its own signals.
