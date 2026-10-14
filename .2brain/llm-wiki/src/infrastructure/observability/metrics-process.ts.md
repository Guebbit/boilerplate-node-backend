---
source: src/infrastructure/observability/metrics-process.ts
sha256: 0daa434fbac3895dd85852db2af4c745204abdc23c8d50f6ce7b1b045229d86b
generated_at: 2026-10-14T08:06:34.503868+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-process.ts

## Purpose

Defines a single process-level Prometheus counter that tracks unhandled promise rejections. The counter exists because the application deliberately survives unhandled rejections (via `handleUnhandledRejection`), and without a metric, those survived failures would be invisible to monitoring.

## Key elements

- **`processUnhandledRejectionsTotal`** (exported `Counter`) — Prometheus counter named `process_unhandled_rejections_total`. Increments each time a promise rejection reaches the process-level `unhandledRejection` handler. Registered against the shared `metricsRegistry`.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Provides the `metricsRegistry` instance that this counter registers with, ensuring it is served alongside all other application metrics.
- **`src/app/error-handling.ts`** — Contains `handleUnhandledRejection`, the handler that increments this counter. This file is the sole *writer* of the metric.
- **`tests/unit/app/error-handling.test.ts`** — Unit tests for the error-handling module, which exercise the path that increments this counter.

## Notes

- The metric is intentionally a **counter**, not a gauge: the doc comment states "Any rate above zero is a bug." Alert on `rate(...) > 0`, not on a threshold.
- This module exports exactly one symbol and has no other logic. All wiring (incrementing the counter) lives in `error-handling.ts`.
- See `docs/tools/prometheus.md` for the broader metrics schema and alerting conventions.
