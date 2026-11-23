---
source: src/infrastructure/observability/metric-config.ts
source_sha256: a76a4ea9c150fc12c01f1d4d1e7586bb4b8bffab2b6ebb7b165726e7fd4eeec4
context_sha256: dfcef920dc6dc1562e76bea8c124449a1ece72a5e3485f4ffd7a875951fae6e8
generated_at: 2026-11-22T02:58:45.350000+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/metric-config.ts

## Purpose
Converts a metric's data entry (defined in `shared/rules/metrics.yaml` and generated into a TypeScript data module) into the options object a prom-client constructor accepts. Because the generated data is `as const` (readonly arrays), the file also bridges the readonly-vs-mutable gap for histogram `buckets`. It never touches a registry; registration (`registers`, `collect`) stays at the call site.

## Key elements
- `MetricData<TLabel>` (internal interface): the shape every metric has: `name`, `help`, and optional readonly `labelNames`.
- `base` (internal): returns `name` and `help`, and includes `labelNames` only when present.
- `counterConfig(data)`: returns a `CounterConfiguration<TLabel>` to spread into `new Counter({ ... })`.
- `gaugeConfig(data)`: returns a `GaugeConfiguration<TLabel>` to spread into `new Gauge({ ... })`.
- `histogramConfig(data)`: requires `buckets: readonly number[]` in addition to the base data. It returns a `HistogramConfiguration<TLabel>` with `buckets` copied into a mutable array.

All three helpers are generic over `TLabel extends string`, defaulting to `never` for unlabelled metrics.

## Relationships
- The neighbor modules in `src/infrastructure/observability/` (`metrics-cache.ts`, `metrics-database.ts`, `metrics-http.ts`, `metrics-outbox.ts`, `metrics-process.ts`, `metrics-queue.ts`, `metrics-rate-limit.ts`, `security-events.ts`) and `src/infrastructure/persistence/command-metrics.ts` are in its dependency neighborhood. They are the metric definitions that would pass their `infrastructureMetricData` entries through these helpers when building prom-client metrics.
- `metrics-registry.ts` relates to it on the registration side. This file deliberately leaves registering to callers.
- `tests/unit/infrastructure/observability/metric-config.test.ts` is its unit test.

## Notes
- The `labelNames` key is omitted from the result when the data has none, rather than being set to `undefined`.
