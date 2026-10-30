---
source: src/infrastructure/observability/metrics-cache.ts
sha256: fb2fe6326dff52cc8ee278409b8ca4b2e20df298732d27c35405bd7b0100e396
generated_at: 2026-10-29T02:09:54.559461+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-cache.ts

## Purpose

Defines two Prometheus counters for the infrastructure cache: one for Redis invalidation failures and one for `setCache` lookup outcomes. It exists to turn events that would otherwise be invisible log lines into alertable, observable signals.

## Key elements

- **`cacheInvalidationFailuresTotal`** (`Counter`) — Counts cache invalidation operations that could not reach Redis, bucketed by tag. The tags are route-level literals, not request-derived values, so the label set is bounded by construction.
- **`cacheRequestsTotal`** (`Counter`) — Counts `setCache` calls by outcome: `hit`, `stale`, `refresh`, `miss`. Provides the only direct hit/miss signal for the cache layer, making stampede size observable rather than estimated.

Both counters register against the shared `metricsRegistry` via the `registers` option, following the same pattern as every other module's metrics file.

## Relationships

- **`metrics-registry.ts`** — Supplies the shared `metricsRegistry` instance both counters register into.
- **`metric-config.ts`** — Provides `counterConfig()`, which wraps each generated metric's base config (name, help, label names) into a `Counter` constructor argument.
- **`metrics.generated.ts`** — Supplies `infrastructureMetricData.cacheInvalidationFailuresTotal` and `.cacheRequestsTotal`, the canonical metric definitions consumed by `counterConfig`.
- **`adapters/cache.ts`** — The `setCache` function whose branches (`hit`/`stale`/`refresh`/`miss`) are what `cacheRequestsTotal` tags enumerate.
- **`http/middlewares/cache.ts`** — The middleware whose invalidation path (Redis `del`) is the source of `cacheInvalidationFailuresTotal` increments.
- **`tests/unit/infrastructure/adapters/cache.test.ts`** / **`tests/unit/infrastructure/http/middlewares/cache.test.ts`** — Unit tests that exercise the code paths these counters measure.

## Notes

- Label cardinality is intentionally finite: invalidation tags are route literals; request-outcome tags are the four fixed branches in `setCache`. Do not add request-derived values to either tag set.
- The file is a `@module` with no named exports beyond the two counters; import them by name, not as a default.
- `cacheInvalidationFailuresTotal` is a post-hoc signal — the stale response has already been delivered by the time it fires. It is for detection and alerting, not for recovery.
