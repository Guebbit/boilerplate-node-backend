---
source: src/infrastructure/observability/metrics-process.ts
sha256: aa5c93e93b65a9c9ee0c55041b18a95b844325f1666fdb120ebfcf6211f35096
generated_at: 2026-10-29T02:10:29.009732+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-process.ts

## Purpose

Defines a single Prometheus counter for unhandled Promise rejections. The counter exists because the app deliberately survives unhandled rejections (see `handleUnhandledRejection` in `error-handling.ts`); without a metric, those silent failures would be invisible in production. It registers the counter on the shared `metricsRegistry`.

## Key elements

- **`processUnhandledRejectionsTotal`** (exported `Counter`) — A monotonically-increasing counter; any non-zero rate indicates a bug (a lost error and its unfinished work). Built from `counterConfig(infrastructureMetricData.processUnhandledRejectionsTotal)` and explicitly registered against `metricsRegistry`.

## Relationships

- **`metrics-registry.ts`** — Supplies the shared `metricsRegistry` instance that this counter registers into.
- **`metric-config.ts`** — Supplies `counterConfig`, which maps a generated data entry to the options object passed to the `prom-client` `Counter` constructor.
- **`metrics.generated.ts`** — Supplies `infrastructureMetricData.processUnhandledRejectionsTotal`, the generated name/help/labels for this metric.
- **`src/app/error-handling.ts`** — The runtime caller: `handleUnhandledRejection` increments this counter when a rejection goes unhandled.
- **`tests/unit/app/error-handling.test.ts`** — Exercises the error-handling path that drives this counter.

## Notes

- The file exports exactly one symbol. If you need to add a second process-level metric, keep the same pattern (generated data → `counterConfig` → explicit `registers` array) so it picks up the shared registry automatically.
- The `registers` option is required here; omitting it would register against `prom-client`'s default registry instead of the app's shared one, making the metric invisible to the scrape endpoint.
