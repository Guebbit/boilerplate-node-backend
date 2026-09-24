---
source: docker/observability/prometheus.alert-rules.yaml
sha256: 91455026c690d9e36b0d84a055203f17b87e5f506e17b5f019d4ec43c38d1913
generated_at: 2026-09-23T17:13:42.535050+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.alert-rules.yaml

## Purpose

Defines the Prometheus alert-rule set for the local API stack. While dashboards give a visual picture, this file encodes the actionable SRE thresholds (availability, error rate, latency, saturation, memory, queue, and webhook delivery) that trigger paging or operator attention when the system crosses a known-bad boundary.

## Key elements

- **`groups[0]` — `api.rules`**: Single rule group containing all alerts; Prometheus evaluates them together.
- **`ApiDown`** (critical): Fires when `up{job="api"}` drops to 0 for 1 min — the scrape target is unreachable.
- **`HighErrorRate`** (warning): 5-minute 4xx/5xx ratio exceeds 5 %; 5 min sustained.
- **`HighP95Latency`** (warning): `histogram_quantile(0.95, …)` on `http_request_duration_milliseconds_bucket` exceeds 2 000 ms; 5 min sustained.
- **`HighInFlightRequests`** (warning): `http_requests_in_flight` > 100 for 2 min.
- **`HighHeapUsage`** (warning): `nodejs_heap_size_used_bytes / nodejs_heap_size_limit_bytes` > 0.90 for 5 min. Denominator is the V8 ceiling (`--max-old-space-size`), **not** `nodejs_heap_size_total_bytes` (see Notes).
- **`QueueJobsParked`** (warning): `increase(queue_jobs_dead_lettered_total[15m]) > 0`, `for: 0m` — any single dead-letter event alerts immediately.
- **`WebhookDeliveriesFailingEverywhere`** (critical): Zero successful deliveries in 30 min **and** > 10 failures in the same window — signals a platform-side outage (egress, DNS, signing), not a single bad subscriber.
- **`WebhookRetriesStalled`** (warning): `webhook_deliveries_overdue` stays > 0 for 15 min — the sweep cron itself has stopped.

## Relationships

- **`docker/observability/prometheus.config.yaml`** — The Prometheus server config that loads this file via its `rule_files` directive and defines the `api` scrape job that `ApiDown` depends on.
- **`infrastructure/observability/metrics-registry.ts`** — Registers `nodejs_heap_size_limit_bytes`, the denominator for `HighHeapUsage`.
- **`infrastructure/observability/metrics-queue.ts`** — Registers `queue_jobs_dead_lettered_total`, the only metric that surfaces dead-letter parking (no other component reads that queue).
- **`scripts/ops/sweep-webhook-retries.ts`** — The per-minute cron that re-enqueues pending webhook retries. `WebhookRetriesStalled` exists to detect when *this* script stops executing.
- **`docs/modules/webhooks.md`** — Documents the design decision that a single subscriber's endpoint failure stays silent (reschedules on its own row); `WebhookDeliveriesFailingEverywhere` complements that by catching fleet-wide egress/signing outages.

## Notes

- **Heap denominator matters.** `HighHeapUsage` deliberately divides by `nodejs_heap_size_limit_bytes`, not `nodejs_heap_size_total_bytes`. Against `total`, a healthy idle Node process already sits at ~0.97 and the alert fires permanently, training operators to ignore it.
- **`QueueJobsParked` uses `for: 0m`.** There is no meaningful threshold above "at least one job was parked"; any increment in 15 min is actionable.
- **Webhook failure vs. parking.** Failed webhook deliveries *reschedule on their own row* and are republished by the sweep — they never land in a dead-letter queue. Therefore `QueueJobsParked` will **not** fire for the webhook queue; `WebhookDeliveriesFailingEverywhere` is the alert that covers that path.
- **Severity is binary.** Alerts are labelled `critical` (ApiDown, WebhookDeliveriesFailingEverywhere) or `warning` (all others). No intermediate tier exists.
