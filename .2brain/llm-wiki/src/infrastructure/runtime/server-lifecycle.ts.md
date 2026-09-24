---
source: src/infrastructure/runtime/server-lifecycle.ts
sha256: 981dcf23232bff0326450c17ae16b4f632a9e9e4896cb334313d87d1b089953f
generated_at: 2026-09-23T17:52:27.792677+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/server-lifecycle.ts

## Purpose

Orchestrates graceful shutdown of the HTTP server and all infrastructure adapters in a fixed, deterministic order, with a hard deadline so a stuck teardown cannot hang the process. It is intentionally decoupled from Express: it only sequences the `stop*` / `shutdown*` calls each adapter already exports and knows nothing about how any individual adapter tears down.

## Key elements

- **`getShutdownTimeoutMs()`** — Reads `NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS` via `environmentNumber`, defaulting to 15 000 ms. Values below 1 fall back to the default. Must stay under the platform's own grace period (K8s `terminationGracePeriodSeconds`, Docker `stop_grace_period`).
- **`closeServer(server)`** — Thin promise wrapper around `http.Server.close()`; resolves once all in-flight sockets are idle.
- **`shutdownInfra(server?)`** — The teardown chain: close server → `stopLocaleOverrideRefresh` → `stopCache` → `stopRateLimitStore` → `stopQueue` → `stopDatabase` → `shutdownAnalytics` → `shutdownTracing`. Accepts an optional `Server` so worker/CLI entry points can call it without one.
- **`registerSignalHandlers(stopFunction)`** — Installs `SIGTERM` and `SIGINT` listeners. On signal, starts an `unref()`-ed forced-exit timer (calls `process.exit(1)` if the deadline passes) and runs `stopFunction` in a floating promise that ends with an explicit `process.exit(0)` or `process.exit(1)`. No-ops entirely when `NODE_ENV === 'test'`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `infrastructure/adapters/cache.ts` | Calls `stopCache()` |
| `infrastructure/adapters/logger.ts` | Uses `logger` for info/error messages throughout |
| `infrastructure/adapters/queue.ts` | Calls `stopQueue()` |
| `infrastructure/http/middlewares/rate-limit-store.ts` | Calls `stopRateLimitStore()` |
| `infrastructure/i18n/index.ts` | Calls `stopLocaleOverrideRefresh()` |
| `infrastructure/observability/analytics/index.ts` | Calls `shutdownAnalytics()` |
| `infrastructure/runtime/database.ts` | Calls `stopDatabase()` |
| `infrastructure/runtime/environment.ts` | Reads `environmentNumber` for the timeout config |
| `infrastructure/runtime/otel-sdk.ts` | Calls `shutdownTracing()` |
| `src/app.ts` | Expected caller of `registerSignalHandlers` / `shutdownInfra` (not imported here) |

## Notes

- **Failure isolation is the adapters' job, not this file's.** The `.then()` chain is linear — a rejection in one step aborts the rest. The doc comment on `shutdownInfra` promises that "each step swallows its own failures"; that guarantee lives inside each `stop*` implementation.
- **Order is deliberate:** traffic-facing resources (locale overrides, cache, rate-limit, queue) shut down before the database, and analytics/tracing go last because they buffer in memory and must still capture logs from the teardown steps above them.
- **`process.exit(0)` is explicit** (not just letting the event loop drain) because OTel timers and driver sockets can otherwise keep the loop alive well past actual shutdown.
- **The forced-exit timer is `.unref()`-ed** so a fast, clean teardown isn't kept alive by the pending timeout.
- **`Stryker disable` comments** on logger lines are intentional: they suppress mutation testing on log-string lines that carry no branching logic.
- **Test-env guard:** `registerSignalHandlers` returns immediately when `NODE_ENV === 'test'` so Jest's own signal handling isn't hijacked by `process.exit` calls.
