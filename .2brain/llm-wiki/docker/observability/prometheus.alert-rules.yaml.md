---
source: docker/observability/prometheus.alert-rules.yaml
source_sha256: d022f418573e9c4535349acc47dedb9685c3d937be50aebb43639a63ecb7175e
context_sha256: 9fceb2efd9c4db5d2460669d454416c3049ead4dcc152fa1893828f4114f131e
generated_at: 2026-11-22T01:33:10.537847+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/observability/prometheus.alert-rules.yaml

## Purpose
Defines the Prometheus alert rules for the local API stack. Dashboards are visual; these rules encode actionable SRE thresholds. They give starter coverage for availability, errors, latency, load, memory, queues, the outbox, webhooks and scheduled jobs. All rules live in a single group, `api.rules`.

## Key elements
- **Availability**
  - `ApiDown` and `WorkerDown` (critical): `up{job="api"}` or `up{job="worker"}` is 0 for 1m.
  - `ApiRestarting` (critical): `changes(process_start_time_seconds{job="api"}[15m]) > 2`, which catches crash loops that `ApiDown`'s 1m wait would miss.
  - `DependencyUnavailable`: one alert name with two rules that differ in severity. The database is critical after 1m. Cache and queue are warning after 5m. Both read `dependency_up`.
- **Queue and outbox**
  - `HeldJobsStuck` (critical): `max by (channel) (queue_held_jobs_oldest_age_seconds) > 900`. It fires when jobs held in the database fallback are not being drained.
  - `QueueJobsParked` (warning): `increase(queue_jobs_dead_lettered_total[15m]) > 0`.
  - `OutboxEventsDead` (warning): `increase(outbox_events_dead_total[15m]) > 0`.
- **Golden signals**
  - `HighErrorRate`: 5xx ratio above 5% for 5m.
  - `HighP95Latency`: p95 of `http_request_duration_milliseconds_bucket` above 2000 ms for 5m.
  - `HighInFlightRequests`: `http_requests_in_flight` above 100 for 2m.
  - `HighHeapUsage`: `nodejs_heap_size_used_bytes / nodejs_heap_size_limit_bytes` above 0.90 for 5m.
- **Webhooks**
  - `WebhookDeliveriesFailingEverywhere` (critical): zero successes and more than 10 failures over 30m.
  - `WebhookRetriesStalled` (warning): `webhook_deliveries_overdue > 0` for 15m, which suggests the retry sweep cron has stopped.
- **Scheduled jobs**
  - `ScheduledJobStale`: uses `job_last_success_timestamp_seconds` to flag nightly `docker/crontab` jobs. Its rule body is not visible here, and the file continues beyond this point.

## Relationships
- `alertmanager.config.template.yaml`: its `inhibit_rules` mute the alerts that follow from a firing database `DependencyUnavailable`. `ApiDown` also mutes `ApiRestarting`.
- `prometheus.alert-rules.test.yaml`: the companion test file for these rules.
- `prometheus.config.yaml`: the Prometheus config that supplies the `api` and `worker` scrape jobs these rules depend on.

## Notes
- Comments in the rules say the metrics are registered by app code (`infrastructure/observability/metrics-registry`, `infrastructure/observability/metrics-queue`, and `metrics.ts`). These are not graph neighbors of this file.
- `HighHeapUsage` divides by `nodejs_heap_size_limit_bytes`, not the total heap size. Against the total, the ratio sat around 0.97 on a healthy idle process, so the alert fired permanently.
- `HighErrorRate` counts 5xx only. 4xx responses are excluded on purpose so one cause does not fire three alerts.
- `WebhookDeliveriesFailingEverywhere` sums each `outcome` side down to a single value before combining them, because an `and` between the raw series never matched. It uses `or vector(0)` to cover a success series that does not exist.
- `QueueJobsParked` never fires for webhook failures, because a failed delivery reschedules rather than parking. The webhook-specific alerts cover that case.
- For `ApiRestarting`, scrape each API copy as its own target. Behind a balancer, `process_start_time_seconds` jumps between copies.
- Many rules use `for: 0m` and alert on any increase above zero, because there is no meaningful threshold.
