---
source: docker/observability/prometheus.alert-rules.yaml
sha256: c36219ace5882c234f4a08438fead21efc0d4f01c7d07eaac532ed7ac0ed6d16
generated_at: 2026-11-14T17:12:35.714330+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.alert-rules.yaml

## Purpose

Defines the full set of Prometheus alert rules for the local API stack, covering the five SRE signals (availability, errors, latency, load, saturation) plus application-specific concerns: crash-loop detection, dependency health, heap pressure, dead-letter queues, outbox poison events, webhook delivery failures, and scheduled-job staleness.

## Key elements

- **`api.rules` (group)** — single rule group containing all alerts; loaded by the Prometheus server.
- **`ApiDown`** — fires when `up{job="api"} == 0` for 1 min (critical).
- **`ApiRestarting`** — fires when `process_start_time_seconds` changes > 2 times in 15 min (critical). Known unreliable under `npm run start:cluster`; muted by `ApiDown`.
- **`DependencyUnavailable`** (two rules, same name) — database: critical, 1 min; cache/queue: warning, 5 min. Uses the app-reported `dependency_up` gauge.
- **`HighErrorRate`** — 5xx ratio > 5 % over 5 min (warning). Deliberately excludes 4xx.
- **`HighP95Latency`** — `histogram_quantile(0.95, …)` > 2000 ms for 5 min (warning).
- **`HighInFlightRequests`** — `http_requests_in_flight > 100` for 2 min (warning).
- **`HighHeapUsage`** — `nodejs_heap_size_used_bytes / nodejs_heap_size_limit_bytes > 0.90` for 5 min (warning). Denominator is the V8 hard limit, not the committed heap.
- **`QueueJobsParked`** — any increase in `queue_jobs_dead_lettered_total` in 15 min (warning).
- **`OutboxEventsDead`** — any increase in `outbox_events_dead_total` in 15 min (warning).
- **`WebhookDeliveriesFailingEverywhere`** — zero successes AND > 10 failures in 30 min (critical). Platform-side outage signal.
- **`WebhookRetriesStalled`** — `webhook_deliveries_overdue > 0` sustained for 15 min (warning). Indicates the sweep cron is not running.
- **`ScheduledJobStale`** — `job_last_success_timestamp_seconds` older than 48 h (warning). Excludes the four frequent sweep tasks.
- **`ScheduledJobNeverSucceeded`** — `job_last_run_timestamp_seconds` exists but `job_last_success_timestamp_seconds` does not, for 1 h (warning). Catches jobs that ran but never succeeded.

## Relationships

- **`docker/observability/prometheus.config.yaml`** — references this file as a rules source; the Prometheus server evaluates these rules on each scrape interval. The config also defines the scrape targets (`job="api"`) whose series these expressions query.
- **`docker/observability/prometheus.alert-rules.test.yaml`** — a test/fixture variant of this file (or a subset) used to validate that rules parse and evaluate correctly without a live stack.

## Notes

- `ApiRestarting` is explicitly documented as unreliable in cluster mode (`npm run start:cluster`): each scrape may hit a different worker, causing `process_start_time_seconds` to jump. `ApiDown` is intended to mute it in that scenario.
- `HighHeapUsage` uses `nodejs_heap_size_limit_bytes` (the `--max-old-space-size` ceiling), not `nodejs_heap_size_total_bytes` (committed heap). Against the latter the ratio sits ≈ 0.97 at idle and the alert would be a permanent false positive.
- `WebhookDeliveriesFailingEverywhere` uses `or vector(0)` to handle the case where no success series has ever been recorded, and sums each side before the `and` because raw series carry different `outcome` labels.
- `ScheduledJobStale` deliberately excludes the four frequent sweep tasks (`sweep:webhook-retries`, `sweep:outbox`, `sweep:payment-effects`, `sweep:reservations`); each has its own purpose-built alert.
- `ScheduledJobNeverSucceeded` uses `unless on (task)` to select jobs that have a run timestamp but no success timestamp at all — a case invisible to the staleness rule.
- While `DependencyUnavailable{database}` fires, Alertmanager is expected to mute downstream consequence alerts (referenced in comments as `alertmanager.config.template.yaml`, `inhibit_rules`); that file is not a graph neighbor here but is operationally coupled.
- The file is heavily comment-annotated; comments explain *why* thresholds and expressions are shaped as they are, not just *what* they do. Preserve these when editing.
