---
source: src/infrastructure/observability/metrics-process.ts
sha256: aa5c93e93b65a9c9ee0c55041b18a95b844325f1666fdb120ebfcf6211f35096
generated_at: 2026-11-08T03:40:32.531007+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-process.ts

## Purpose

Declares a single Prometheus counter that tracks unhandled promise rejections. The counter exists because the app intentionally *survives* unhandled rejections (rather than crashing), so without an explicit metric those silent failures would be invisible.

## Key elements

- **`processUnhandledRejectionsTotal`** (exported `Counter`) — a Prometheus counter incremented for every unhandled rejection that no handler catches. Built from `counterConfig(infrastructureMetricData.processUnhandledRejectionsTotal)` and registered against the shared `metricsRegistry`.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — supplies the shared `metricsRegistry` that this counter registers into, ensuring it is exposed via the single `/metrics` endpoint.
- **`src/infrastructure/observability/metric-config.ts`** — provides the `counterConfig` helper that assembles the counter's name, help text, and labels from the generated metric definition.
- **`src/app/error-handling.ts`** — contains `handleUnhandledRejection`, the process-level handler that *survives* rejections. This file's counter is the observability counterpart to that handler: the handler prevents a crash, the counter makes the event visible.
- **`tests/unit/app/error-handling.test.ts`** — unit tests for the error-handling logic that this metric quantifies; useful context for when and how the counter would be incremented.

## Notes

- The counter is **imported, not created, at process start** — simply importing this module is sufficient for registration (side-effect of `new Counter` with `registers: [metricsRegistry]`).
- The metric data source is `metrics.generated.ts` (not in the neighbor list above), meaning the metric's name and help string live in a generated file, not here.
- A non-zero rate of this counter is treated as a **bug signal**, not an expected background signal.
