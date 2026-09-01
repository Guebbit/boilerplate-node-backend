# src/infrastructure/observability/metrics-cache.ts

## Purpose

Defines a single Prometheus counter that makes cache-invalidation failures observable. When a successful write cannot invalidate its predecessor in Redis, the stale response is already served; this counter is the only actionable signal, turning a silent correctness gap into an alertable metric.

## Key elements

- **`cacheInvalidationFailuresTotal`** (Counter) — Exported counter (`cache_invalidation_failures_total`) with a single label `tag`. Incremented per failed Redis invalidation. Label values are route-declared literals, so cardinality is bounded by construction.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — Imports `metricsRegistry`, the shared registry into which this counter registers itself. This is the same pattern used by other infrastructure metric modules.
- **`src/infrastructure/http/middlewares/cache.ts`** — The expected consumer: the middleware that attempts Redis invalidation after a write and increments this counter when that call fails.

## Notes

- The `tag` label is deliberately restricted to compile-time literals from route definitions (never request-derived), keeping Prometheus label cardinality bounded.
- The counter is *additive only*; there is no gauge or reset logic. A non-zero rate indicates stale data is being served until natural TTL expiry.
- See `docs/tools/prometheus.md` for alerting rules and dashboard references.
