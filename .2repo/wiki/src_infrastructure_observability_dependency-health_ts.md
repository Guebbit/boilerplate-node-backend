# src/infrastructure/observability/dependency-health.ts

## Purpose

Readiness health report for all backing services (database, cache, queue). It reports the *current* connection state each adapter already maintains — no I/O is performed — and is published by `GET /observability/health`. It is deliberately separate from the liveness probe (`GET /`) so that a degraded dependency signals degradation without triggering a container restart.

## Key elements

- **`DependencyStatus`** — union type `'ready' | 'connecting' | 'unavailable' | 'disabled'`; the single vocabulary used for all three dependencies.
- **`DependencyHealth`** — interface with `database`, `cache`, `queue` fields, each a `DependencyStatus`.
- **`DATABASE_STATES`** (module-private) — maps Mongoose `readyState` integers (0–3) to `DependencyStatus`. State 3 (`disconnecting`) maps to `unavailable`, not `connecting`.
- **`dependencyHealth()`** — pure read: returns a `DependencyHealth` object by looking up `connection.readyState` and calling `cacheState()` / `queueState()`. Zero I/O.
- **`overallStatus(dependencies)`** — pure fold: returns `'ok'` if every dependency is `ready` or `disabled`, otherwise `'degraded'`. Binary; per-service detail lives in the `DependencyHealth` map itself.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — imports `connection` to read `readyState`.
- **`src/infrastructure/adapters/cache.ts`** — imports `cacheState()` which reports the cache adapter's live connection status.
- **`src/infrastructure/adapters/queue.ts`** — imports `queueState()` which reports the queue adapter's live connection status.
- **`src/infrastructure/runtime/managed-connection.ts`** — cache and queue adapters maintain their memoised handles through this module; the states this file reads are the same states those adapters act on at runtime.
- **`src/modules/observability/controllers/get-observability-health.ts`** — the controller that calls `dependencyHealth()` and `overallStatus()` to build the HTTP response.
- **`tests/unit/infrastructure/observability/dependency-health.test.ts`** — unit tests for the mapping logic and fold.

## Notes

- **No I/O, by design.** The file never opens sockets. A health endpoint polled every few seconds by every replica that *does* open connections is a DoS amplifier. All state is a memory read of what the adapters already track.
- **`disabled` ≠ failure.** Deployments without Redis or RabbitMQ are supported configurations; `disabled` is a valid, non-degraded status. Mongo has no `disabled` variant.
- **`connecting` is distinct from `unavailable`.** During the production Dockerfile start period, "not yet connected" and "broken" must be distinguishable in the payload.
- **`overallStatus` is intentionally binary.** The per-service detail is in the `dependencies` object one level up; the top-level word is only for dashboards colouring a single dot.
- **Mongoose state 3 (`disconnecting`) → `unavailable`.** A disconnecting connection is on its way *out*; mapping it to `connecting` would report a shutdown as a startup.
