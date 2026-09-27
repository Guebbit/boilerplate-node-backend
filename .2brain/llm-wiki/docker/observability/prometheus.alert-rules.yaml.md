---
source: docker/observability/prometheus.alert-rules.yaml
sha256: 9faefb9cbab00b7c99b9cff385e7b7b32698fa28f4ec988da6dd5b408c08365d
generated_at: 2026-09-27T13:47:41.859828+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.alert-rules.yaml

## Purpose

Defines the full set of Prometheus alert rules for the local API stack. While dashboards provide visual context, this file encodes the actionable SRE thresholds — availability, error rate, latency, saturation, memory, queue health, webhook delivery, and scheduled-job liveness — into alerts with explicit severity and annotations.

## Key elements

All rules live in a single group, `api.rules`:

- **ApiDown** (`critical`) — `up{job="api"} == 0` for 1 min. The metrics endpoint is unreachable.
- **HighErrorRate** (`warning`) — 4xx/5xx ratio above 5 % over a 5-min window, sustained 5 min.
- **HighP95Latency** (`warning`) — `histogram_quantile(0.95, …)` over `http_request_duration_milliseconds_bucket` exceeds 2 000 ms for 5 min.
- **HighInFlightRequests** (`warning`) — `http_requests_in_flight > 100` for 2 min.
- **HighHeapUsage** (`warning`) — `nodejs_heap_size_used_bytes / nodejs_heap_size_limit_bytes > 0.90` for 5 min. Denominator is V8's fixed ceiling (`nodejs_heap_size_limit_bytes`), not the dynamically-growing `total`.
- **QueueJobsParked** (`warning`) — `increase(queue_jobs_dead_lettered_total[15m]) > 0`. Fires on the first dead-lettered job; no higher threshold is meaningful.
- **WebhookDeliveriesFailingEverywhere** (`critical`) — zero successes and > 10 failures in 30 min. Signals a platform-side outage (egress, DNS, signing), not a single subscriber issue.
- **WebhookRetriesStalled** (`warning`) — `webhook_deliveries_overdue > 0` for 15 min. Indicates the retry-sweep cron itself has stopped running.
- **ScheduledJobStale** (`warning`) — `time() - job_last_success_timestamp_seconds > 48 h` for nightly jobs (excludes the three high-frequency sweeps).
- **FrequentSweepStale** (`warning`) — same metric but a 30-min threshold for `sweep:payment-effects` and `sweep:reservations`, which run every 5 minutes.

## Relationships

- **docker/observability/prometheus.config.yaml** — The Prometheus server configuration that references this file (via `rule_files`) so the rules are evaluated and exposed for alerting.
- **docs/modules/webhooks.md** — Cited in annotations for the webhook alerts; documents why individual subscriber failures stay silent by design and how the dead-letter / reschedule flow works.
- **scripts/ops/sweep-webhook-retries.ts** — The cron job whose liveness `WebhookRetriesStalled` monitors. It republishes overdue `pending` webhook rows back onto the queue; if it stops, `webhook_deliveries_overdue` grows and this alert fires.

## Notes

- **Heap alert denominator** — Using `nodejs_heap_size_total_bytes` instead of `nodejs_heap_size_limit_bytes` makes the ratio sit near 0.97 on an idle process and fires permanently. The `limit` metric is registered by `infrastructure/observability/metrics-registry`.
- **Webhook vs. queue alerting** — Failed webhook deliveries reschedule on their own row and are republished by the sweep; they never reach the dead-letter queue. So `QueueJobsParked` will *not* fire for webhook failures — `WebhookDeliveriesFailingEverywhere` is the correct signal.
- **Scheduled-job thresholds are tiered** — Nightly jobs get a 48 h window; the 5-minute sweeps (`payment-effects`, `reservations`) get 30 min. A single shared threshold would either page constantly on the fast jobs or let nightly failures go unnoticed for 48 h.
- **`for: 0m`** on `QueueJobsParked`, `WebhookDeliveriesFailingEverywhere`, `WebhookRetriesStalled`, `ScheduledJobStale`, and `FrequentSweepStale` means the alert fires immediately when the expression is true — there is no "sustained" window because a single occurrence (or one missed run) is already significant.
