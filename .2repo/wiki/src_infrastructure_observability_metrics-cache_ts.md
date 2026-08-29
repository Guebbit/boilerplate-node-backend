# src/infrastructure/observability/metrics-cache.ts

## Purpose

Defines the sole Prometheus counter for cache-invalidation failures. It exists to make alertable a failure mode where a write succeeds but the cached predecessor is not removed, leaving a stale response in service for the full TTL — a condition a log line cannot surface to monitoring.

## Key elements

- **`cacheInvalidationFailuresTotal`** (`Counter`) — exported Prometheus counter (`cache_invalidation_failures_total`). Labeled by `tag` (a route-declared literal, never request data). Registered against the shared `metricsRegistry`.

## Relationships

- **`./metrics-http`** — imports `metricsRegistry`, the shared registry all infrastructure metrics register into. This file does not define its own registry.
- **`src/infrastructure/http/middlewares/cache.ts`** — the cache middleware is the expected caller that increments this counter when a Redis invalidation call fails. (Inferred from the metric's purpose and the middleware's role; the import direction is middleware → this file.)

## Notes

- The `tag` label is intentionally low-cardinality: values are compile-time literals declared on routes, not dynamic request data. Do not widen this to unbounded strings.
- There is exactly one metric in this file by design. If a second cache-related metric is needed, reconsider whether it belongs here or in a sibling module.
- The counter is *informational only* — the response has already been sent by the time the failure is detected, so incrementing it is the sole remediation action.
