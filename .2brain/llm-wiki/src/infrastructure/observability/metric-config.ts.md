---
source: src/infrastructure/observability/metric-config.ts
sha256: 99c9a3534e7d21041ed331f66730bb672e2b0f3b3555238fa6a056b9fa21c58a
generated_at: 2026-11-08T03:39:41.298282+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metric-config.ts

## Purpose

Adapts the `as const` metric definitions (generated from `shared/rules/metrics.yaml` into `metrics.generated.ts`) into the constructor-option objects that `prom-client` expects. It is a pure mapping layer—no side effects, no registry access.

## Key elements

- **`MetricData<TLabel>`** (internal) – Shared shape: `name`, `help`, optional `labelNames`.
- **`base(data)`** (internal) – Extracts `name`, `help`, and conditionally `labelNames` from a `MetricData` entry.
- **`counterConfig(data)`** – Returns a `CounterConfiguration<TLabel>` ready to spread into `new Counter({ ... })`.
- **`gaugeConfig(data)`** – Returns a `GaugeConfiguration<TLabel>` ready to spread into `new Gauge({ ... })`.
- **`histogramConfig(data)`** – Returns a `HistogramConfiguration<TLabel>`; in addition to the base fields it copies the `buckets` array into a new mutable `number[]`.

## Relationships

- **Consumers** (`metrics-cache`, `metrics-http`, `metrics-outbox`, `metrics-process`, `metrics-queue`, `metrics-rate-limit`, `security-events`, `command-metrics`) call these three functions to obtain constructor options, then pass the result to `new Counter/Gauge/Histogram` and register the metric.
- **`metrics-registry.ts`** – Provides the `Registry` instance that consumers register metrics into. This file deliberately does not import or mutate a registry.
- **`metric-config.test.ts`** – Unit tests verifying the shape of each exported config, including the buckets copy behavior.

## Notes

- `buckets` is spread-copied (`[...data.buckets]`) because the generated data is `readonly number[]` while prom-client requires a mutable `number[]`. Mutating the result will not affect the source data.
- `labelNames` is omitted from the output object entirely when the metric has no labels (conditional spread), so consumers can spread the config without a `labelNames: undefined` key.
- Registration (calling `registry.register(metric)`) and any `collect` callbacks are always the caller's responsibility—this module is stateless.
