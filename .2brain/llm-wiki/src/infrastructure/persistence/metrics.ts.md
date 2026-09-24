---
source: src/infrastructure/persistence/metrics.ts
sha256: 4186caba3ccda1d29c36beec5bfb39ff94ebd47c17b8299b41965b3e8d94bb14
generated_at: 2026-09-23T17:50:21.742396+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/metrics.ts

## Purpose

Defines Prometheus counters for database activity (total queries, total errors) and a `trackDatabaseQuery` wrapper that instruments repository method calls. Exists so that `createRepository`'s Mongoose calls are observable through the shared metrics endpoint (`GET /observability/metrics/overview`) alongside domain-level counters.

## Key elements

- **`databaseQueriesTotal`** (`Counter`, `db_queries_total`) — incremented once per repository method invocation.
- **`databaseErrorsTotal`** (`Counter`, `db_errors_total`) — incremented only when the wrapped call rejects.
- **`trackDatabaseQuery`** — higher-order function that takes an async function and returns a new async function. On invocation it bumps `databaseQueriesTotal`; if the inner call throws/rejects it bumps `databaseErrorsTotal` before re-throwing.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — both counters are registered against the shared `metricsRegistry` instance exported there, making them visible to the overview endpoint without per-module registry setup.
- **`src/infrastructure/persistence/create-repository.ts`** — the factory methods in `createRepository` produce the repository methods that are wrapped by `trackDatabaseQuery`, so every Mongoose call made through those factories is counted.

## Notes

- The wrapper is synchronous to increment, then delegates to the promise chain — `databaseQueriesTotal` always increments even if the call later fails; `databaseErrorsTotal` fires only on rejection (not on synchronous throws inside `function_`, since the wrapper expects a `Promise` return type).
- Counter `name` values (`db_queries_total`, `db_errors_total`) are the wire names exposed over Prometheus text format; they differ from the export identifiers.
