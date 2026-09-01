# src/infrastructure/persistence/metrics.ts

## Purpose

Prometheus counters for database query volume and failures, plus a helper HOF that instruments repository methods. The counters are surfaced through the `GET /observability/metrics/overview` endpoint, mirroring how domain-level counters in `modules/*/metrics.ts` are read.

## Key elements

- **`databaseQueriesTotal`** (`db_queries_total`) — Prometheus `Counter` incremented once per repository method call.
- **`databaseErrorsTotal`** (`db_errors_total`) — Prometheus `Counter` incremented when a repository method call rejects.
- **`trackDatabaseQuery<TArgs, TResult>(fn)`** — Higher-order wrapper: calls `fn`, increments `databaseQueriesTotal` before the call, and on rejection increments `databaseErrorsTotal` before re-throwing. Preserves the original return type and argument signature.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — Imports `metricsRegistry`, the shared Prometheus `Registry` into which both counters register.
- **`src/infrastructure/persistence/create-repository.ts`** — The consumer; its factory methods wrap each Mongoose call with `trackDatabaseQuery` so every query/error is counted.

## Notes

- Both counters are registered at module-load time via the `registers` array, so importing this file (transitively through `create-repository`) is sufficient to make them appear in `/observability/metrics/overview`.
- `trackDatabaseQuery` is *fire-and-rethrow*: it never swallows or transforms the error. The catch block exists solely to increment the error counter.
- The module is annotated `@module` — it has no default export and is not meant to be re-exported as a namespace.
