---
source: docker/observability/prometheus.alert-rules.yaml
sha256: 8b919e102c3d68c3043c57158d2605a62d9406a0f08ce8f96eb879569724094d
generated_at: 2026-10-14T06:51:04.810971+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.alert-rules.yaml

## Purpose

Defines the actionable SRE alert rules for the local API stack. While Prometheus dashboards provide visual context, this file encodes the thresholds that actually page someone. It covers availability, error rate, latency, saturation, memory pressure, queue/outbox dead-lettering, webhook delivery, and scheduled-job staleness — all in a single `api.rules` group.

## Key elements

- **`api.rules` group** — single Prometheus alert group containing all rules below.
- **`ApiDown`** (critical) — `up{job="api"} == 0` for 1 min. The baseline liveness alert.
- **`ApiRestarting`** (critical) — `changes(process_start_time_seconds{job="api"}[15m]) > 2`. Catches crash loops that outpace `ApiDown`. Not reliable when `NODE_ENABLE_CLUSTERING` is on (scrapes hit different workers).
- **`DependencyUnavailable`** (critical / warning) — two rules on `dependency_up{…}`: database down = critical (1 min), cache or queue down = warning (5 min). The database rule mutes downstream alerts via Alertmanager inhibition rules.
- **`HighErrorRate`** (warning) — 5xx ratio > 5 % over 5 min. Deliberately excludes 4xx.
- **`HighP95Latency`** (warning) — p95 of `http_request_duration_milliseconds_bucket` > 2000 ms for 5 min.
- **`HighInFlightRequests`** (warning) — `http_requests_in_flight > 100` for 2 min.
- **`HighHeapUsage`** (warning) — `nodejs_heap_size_used_bytes / nodejs_heap_size_limit_bytes > 0.90`. Denominator is the V8 hard limit, not the (growable) committed total.
- **`QueueJobsParked`** (warning) — any increase in `queue_jobs_dead_lettered_total[15m]`. Zero is the only healthy value.
- **`OutboxEventsDead`** (warning) — any increase in `outbox_events_dead_total[15m]`. Same "any > 0" shape.
- **`WebhookDeliveriesFailingEverywhere`** (critical) — zero successes + > 10 failures in 30 min across *all* webhook deliveries. Signals platform-side egress/DNS/signing failure, not a single bad endpoint.
- **`WebhookRetriesStalled`** (warning) — `webhook_deliveries_overdue > 0` sustained for 15 min. Indicates the retry-sweep cron itself has stopped.
- **`ScheduledJobStale`** (warning) — `time() - job_last_success_timestamp_seconds{task!~"sweep:…"} > 48 h`. Excludes the five frequent sweep jobs (covered by their own alerts).
- **`ScheduledJobNeverSucceeded`** (warning) — `job_last_run_timestamp_seconds unless on (task) job_last_success_timestamp_seconds` for 1 h. Catches jobs that ran but have no success series at all.

## Relationships

- **`docker/observability/prometheus.config.yaml`** — loads this file via `rule_files`; the `job="api"` scrape target defined there is what all rules query against.
- **`docs/modules/webhooks.md`** — referenced from the `WebhookDeliveriesFailingEverywhere` alert annotations; documents why per-endpoint failures stay silent by design and links to the outbox poison-event section.
- **`scripts/ops/sweep-webhook-retries.ts`** — the cron job whose health `WebhookRetriesStalled` monitors; also excluded from `ScheduledJobStale` via the `task!~"sweep:webhook-retries|…"` filter.

## Notes

- **`DependencyUnavailable` shares one alert name across two rules** (different `for`/`severity`). Alertmanager's `inhibit_rules` in `alertmanager.config.template.yaml` mute cache/queue alerts while the database one is firing.
- **`ApiRestarting` is unreliable under `NODE_ENABLE_CLUSTERING`**: `process_start_time_seconds` jumps between workers on successive scrapes. `ApiDown` is intended to mask it in that configuration.
- **`HighHeapUsage` uses `nodejs_heap_size_limit_bytes`** (V8's fixed ceiling, registered by `infrastructure/observability/metrics-registry`), not `nodejs_heap_size_total_bytes`, which would keep the ratio near 0.97 on an idle process and fire permanently.
- **`WebhookDeliveriesFailingEverywhere` sums each `outcome` side separately before the `and`** — a raw series-level `and` never matches because the `outcome` label differs. `or vector(0)` covers the case where the success series has never existed.
- **`ScheduledJobStale` excludes the five `sweep:*` tasks** because they run every 1–5 min; a 48-hour threshold would either page constantly or miss a 48-hour gap. Those jobs are covered by `WebhookRetriesStalled`, `OutboxEventsDead`, and their respective purpose-built alerts.
- **Dead-letter and outbox-dead alerts use `increase(…[15m]) > 0` with `for: 0m`** — there is no meaningful numeric threshold above zero; any occurrence is actionable.
