# src/infrastructure/observability/dependency-health.ts

## Purpose

Provides a single, I/O-free snapshot of the readiness state of every backing service (database, cache, queue) the process depends on. It feeds the `GET /observability/health` endpoint and is explicitly separated from liveness so that a degraded dependency does not trigger an orchestrator container restart.

## Key elements

- **`DependencyStatus`** (type) — Four-word vocabulary: `'ready' | 'connecting' | 'unavailable' | 'disabled'`. `disabled` is a valid, non-degraded state for optional backends.
- **`DependencyHealth`** (interface) — Shape of the payload: `{ database, cache, queue }`, each a `DependencyStatus`.
- **`DATABASE_STATES`** (const map) — Translates Mongoose `readyState` integers (0–3) into `DependencyStatus`.
- **`dependencyHealth()`** (exported function) — Reads `connection.readyState`, `cacheState()`, and `queueState()` in one pass and returns a `DependencyHealth` object. No network or disk I/O.
- **`overallStatus(dependencies)`** (exported function) — Pure fold: returns `'ok'` if every dependency is `ready` or `disabled`, otherwise `'degraded'`.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — Imports the Mongoose `connection` singleton; reads `connection.readyState` (an in-memory integer) to determine database status.
- **`src/infrastructure/adapters/cache.ts`** — Imports `cacheState()` to obtain the current cache adapter status.
- **`src/infrastructure/adapters/queue.ts`** — Imports `queueState()` to obtain the current queue adapter status.
- **`src/modules/observability/controllers/get-observability-health.ts`** — Consumes `dependencyHealth()` and `overallStatus()` to build the JSON response for the observability health endpoint.
- **`tests/unit/infrastructure/observability/dependency-health.test.ts`** — Unit-tests the mapping logic and the `overallStatus` fold.

## Notes

- **Readiness ≠ liveness.** The file header explicitly states this module must never influence the orchestrator's restart decision. `GET /` (liveness) and `GET /observability/health` (readiness) are separate concerns.
- **`disabled` is not a failure.** A deployment may omit Redis or RabbitMQ entirely; reporting those as broken would train operators to ignore the field. Mongo has no `disabled` state.
- **Mongoose `readyState` 3 (`disconnecting`) maps to `unavailable`,** not `connecting`. The connection is on its way out and will not serve again, so labeling it "nearly ready" would misreport a shutdown as a startup.
- **`overallStatus` is a pure function** that receives its input as a parameter rather than calling `dependencyHealth()` internally, keeping it trivially testable and side-effect-free.
- **No I/O is performed anywhere in this module.** Every dependency already tracks its own state in memory; this file only reads those in-memory values.
