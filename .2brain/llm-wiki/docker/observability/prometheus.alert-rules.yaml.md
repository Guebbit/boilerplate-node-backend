---
source: docker/observability/prometheus.alert-rules.yaml
sha256: 194f73cda65d6a46d7ec9bb5917bb50649b9e844a3909d76ea0d8cc0cace8135
generated_at: 2026-10-29T01:19:00.330784+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.alert-rules.yaml

## Purpose

Defines the full set of Prometheus alert rules for the local API stack, covering availability, error rate, latency, saturation, memory pressure, queue/outbox failures, webhook delivery, and scheduled-job liveness. These are the actionable SRE thresholds that complement the visual dashboards.

## Key elements

- **ApiDown** — `up{job="api"} == 0` for 1 min; critical. Primary availability signal.
- **ApiRestarting** — `changes(process_start_time_seconds{job="api"}[15m]) > 2`; critical. Detects crash loops that `ApiDown`'s 1-min wait would miss. Muted when `ApiDown` fires; unreliable under `NODE_ENABLE_CLUSTERING`.
- **DependencyUnavailable** (two rules, same name) — `dependency_up` gauge from the app. Critical for `database` (1 min), warning for `cache|queue` (5 min). Database firing inhibits its downstream alerts via Alertmanager.
- **HighErrorRate** — 5xx ratio > 5 % over 5 min; warning. Deliberately excludes 4xx.
- **HighP95Latency** — `histogram_quantile(0.95, …)` > 2 000 ms for 5 min; warning.
- **HighInFlightRequests** — `http_requests_in_flight > 100` for 2 min; warning.
- **HighHeapUsage** — used / `nodejs_heap_size_limit_bytes` > 0.90 for 5 min; warning. Denominator is the V8 ceiling, not the committed heap, to avoid a permanently-firing alert.
- **QueueJobsParked** — any increase in `queue_jobs_dead_lettered_total[15m]`; warning. Only signal for parked jobs.
- **OutboxEventsDead** — any increase in `outbox_events_dead_total[15m]`; warning. Mirrors the queue rule for the transactional outbox.
- **WebhookDeliveriesFailingEverywhere** — zero successes AND > 10 failures in 30 min; critical. Platform-side outage indicator; uses `or vector(0)` to handle a missing success series.
- **WebhookRetriesStalled** — `webhook_deliveries_overdue > 0` for 15 min; warning. Indicates the `sweep:webhook-retries` cron is not running.
- **ScheduledJobStale** — `time() - job_last_success_timestamp_seconds > 2 * 86400`; warning. Excludes the four high-frequency sweep tasks (covered by their own alerts).
- **ScheduledJobNeverSucceeded** — `job_last_run_timestamp_seconds unless on (task) job_last_success_timestamp_seconds` for 1 h; warning. Catches jobs whose success series never materialized.

All rules live in a single group named `api.rules`.

## Relationships

- **docker/observability/prometheus.config.yaml** — The Prometheus server config that references (via `rule_files`) this alert-rules file so the rules are evaluated. Without that reference the rules are inert.
- **docs/modules/webhooks.md** — Referenced by the `WebhookDeliveriesFailingEverywhere` and `WebhookRetriesStalled` annotations to explain *why* a single failing subscriber endpoint stays quiet by design and why only fleet-wide failure triggers the critical alert.

## Notes

- **Two rules share the name `DependencyUnavailable`.** Prometheus allows this within one group as long as the expressions differ; severity is the differentiator (critical vs. warning). When writing matching/inhibition rules, match on both `alertname` *and* `severity`.
- **`ApiRestarting` is intentionally unreliable under `NODE_ENABLE_CLUSTERING`.** Each scrape hits a different worker, making `process_start_time_seconds` jump. The comment and annotation both flag this; `ApiDown` muting it is the intended mitigation.
- **Heap alert uses `nodejs_heap_size_limit_bytes`, not `total`.** The `total` metric sits ≈ 0.97 on an idle process and would fire permanently. The `limit` metric is registered by `infrastructure/observability/metrics-registry`.
- **`WebhookDeliveriesFailingEverywhere` uses `or vector(0)`.** Without it, if no success series ever existed, the left-hand side of the `and` would be an empty vector and the expression would never evaluate to true.
- **`ScheduledJobStale` excludes four sweep tasks** (`sweep:webhook-retries`, `sweep:outbox`, `sweep:payment-effects`, `sweep:reservations`) via `task!~`. Those run every 1–5 min and have dedicated alerts; a shared 48 h threshold would either fire constantly or page too late.
- **`ScheduledJobNeverSucceeded` uses `unless on (task)`.** This is how it finds jobs that have a `last_run` series but no `last_success` series at all—something the staleness rule structurally cannot see.
