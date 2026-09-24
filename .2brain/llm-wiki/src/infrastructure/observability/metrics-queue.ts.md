---
source: src/infrastructure/observability/metrics-queue.ts
sha256: f4898c56379b869cbef664cf74e49ab2c00321d30c64f3aef684625e300a2bef
generated_at: 2026-09-23T17:49:06.586216+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metrics-queue.ts

## Purpose

Defines the sole Prometheus counter for dead-letter queue activity in the system. It exists so that parked jobs (permanent rejections or exhausted retries) are observable as a metric rather than a one-off log line, enabling alerting on a sustained dead-letter rate.

## Key elements

- **`queueJobsDeadLetteredTotal`** (exported `Counter`) — Prom metric `queue_jobs_dead_lettered_total`, labelled by `queue` (bounded to `WORKER_CHANNELS` values). Increments each time a job is parked in a `<queue>.dead` destination. Registered against the shared `metricsRegistry`.

## Relationships

- **`./metrics-registry`** — Provides the `metricsRegistry` instance that this counter registers against, matching the pattern every other module's `metrics.ts` file follows.
- **`src/infrastructure/adapters/queue.ts`** — The queue adapter is the expected caller that increments this counter when a job is dead-lettered (the file's doc comment frames the counter as the visibility mechanism for that action).
- **`tests/unit/infrastructure/adapters/queue.test.ts`** — Unit tests for the queue adapter; the only test neighbor in the graph, implying the counter's increment path is exercised there.

## Notes

- The label value space is intentionally bounded (only `WORKER_CHANNELS` names, never request-derived data) to keep the metric series finite.
- The intended alert is a **rate > 0** on this counter (rule `QueueJobsParked` in `prometheus.alert-rules.yaml`), not a threshold on an absolute value. No other component reads `<queue>.dead` on its own.
- See `docs/tools/prometheus.md` for the broader metrics conventions.
