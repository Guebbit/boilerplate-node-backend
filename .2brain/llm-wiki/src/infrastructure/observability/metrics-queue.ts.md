---
source: src/infrastructure/observability/metrics-queue.ts
sha256: 9d0e01b2bb4b7e55284cb193c5e98f20d1ec7adc8b548f77dd1fd8e8c4d2c2db
generated_at: 2026-11-08T03:40:39.743967+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-queue.ts

## Purpose

Registers a single Prometheus counter for jobs dead-lettered into a queue's `<queue>.dead` channel. It exists because a parked job is otherwise only visible in a log line at the moment it happens; a sustained rate of dead-lettering signals a down dependency or a deterministic bug, and this counter is the sole signal that surfaces in Prometheus.

## Key elements

- **`queueJobsDeadLetteredTotal`** — A `prom-client` `Counter`. Incremented (by the queue adapter) whenever a job is permanently rejected or exhausts retries. Registered against the shared `metricsRegistry` at import time. Label `queue` is bounded by construction to values in `WORKER_CHANNELS` (never request-derived data).

## Relationships

- **`metrics-registry.ts`** — Provides the shared `metricsRegistry` that this counter registers into, making it part of the app-wide metric set.
- **`metric-config.ts`** — Supplies the `counterConfig` factory used to spread standard naming/help/labels onto the counter definition.
- **`src/infrastructure/adapters/queue.ts`** — The queue adapter that increments `queueJobsDeadLetteredTotal` when it parks a job into the dead-letter channel.
- **`tests/unit/infrastructure/adapters/queue.test.ts`** — Exercises the queue adapter, which indirectly verifies that the counter is incremented on dead-letter events.

## Notes

- The alert for this metric (`QueueJobsParked` in `prometheus.alert-rules.yaml`) fires on a non-zero *rate*, not on a cumulative threshold. Any dead-letter above zero is treated as an incident signal.
- Label values for `queue` are constrained to the static `WORKER_CHANNELS` set, so the series cardinality is bounded and no per-tenant or per-request labels are ever attached.
- The `registers: [metricsRegistry]` option is what wires this counter into the shared registry; omitting it would produce an unregistered (and unexported) metric.
