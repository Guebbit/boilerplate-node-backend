---
source: src/infrastructure/observability/metrics-queue.ts
sha256: 9d0e01b2bb4b7e55284cb193c5e98f20d1ec7adc8b548f77dd1fd8e8c4d2c2db
generated_at: 2026-10-29T02:10:37.538577+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-queue.ts

## Purpose

Defines the single Prometheus counter that makes dead-lettered queue jobs visible in metrics. Without it, a parked job is only observable via a transient log line; with it, a queue that keeps rejecting or exhausting retries becomes a measurable, alertable signal.

## Key elements

- **`queueJobsDeadLetteredTotal`** (exported `Counter`) — Counts jobs parked in `<queue>.dead` (permanent rejection or exhausted retries). Registered against the shared `metricsRegistry`. The `queue` label is bounded by construction: names come from `WORKER_CHANNELS`, never from request data. A rate above zero is itself the alert (`QueueJobsParked` in `prometheus.alert-rules.yaml`); no threshold is layered on top.

## Relationships

- **`./metrics-registry`** — Provides the shared `metricsRegistry` instance this counter registers with, ensuring it appears alongside all other module metrics in the same Prometheus scrape target.
- **`@infrastructure/observability/metric-config`** — Supplies `counterConfig`, a helper that normalizes common counter options (type, help-text prefix, etc.) so each module's counter stays consistent.
- **`@infrastructure/observability/metrics.generated`** — Provides `infrastructureMetricData.queueJobsDeadLetteredTotal`, the machine-generated definition (name, description, label set) consumed by `counterConfig`.
- **`src/infrastructure/adapters/queue.ts`** — The queue adapter that increments this counter when a job is dead-lettered (the only consumer of the metric in the codebase).
- **`tests/unit/infrastructure/adapters/queue.test.ts`** — Verifies the counter increments correctly when the queue adapter parks a job.

## Notes

- The doc comment explicitly states the label cardinality guarantee: queue names originate from the static `WORKER_CHANNELS` list, so no unbounded label explosion is possible.
- This file is intentionally minimal (one counter). If you need a new queue metric, follow the same pattern: add a definition to `metrics.generated.ts`, then register here.
- The alert fires on rate > 0, not on a threshold. Do not add a secondary "high rate" alert expecting this metric to be near-zero in steady state.
