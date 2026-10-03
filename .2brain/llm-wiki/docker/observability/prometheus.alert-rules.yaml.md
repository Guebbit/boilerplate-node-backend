---
source: docker/observability/prometheus.alert-rules.yaml
sha256: ce5dd118e27950c7cc36405b961ed20f915f5d776d5e5449cc66fc80ac559dfa
generated_at: 2026-10-01T12:18:17.027960+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.alert-rules.yaml

## Purpose

Defines the full set of Prometheus alert rules for the local API stack. While dashboards provide visual context, this file encodes the actionable SRE thresholds (availability, error rate, latency, saturation, memory, queue health, webhook delivery, and scheduled-job liveness) that trigger pages and warnings.

## Key elements

Single rule group `api.rules` containing eleven alerts:

- **ApiDown** (critical) – `up{job="api"} == 0` sustained 1 min; the metrics endpoint is unreachable.
- **HighErrorRate** (warning) – 5-min 4xx/5xx ratio > 5 %.
- **HighP95Latency** (warning) – p95 request duration > 2 000 ms over 5 min.
- **HighInFlightRequests** (warning) – `http_requests_in_flight > 100` sustained 2 min.
- **HighHeapUsage** (warning) – Node.js heap used > 90 % of `nodejs_heap_size_limit_bytes` (the V8 ceiling, not the committed total).
- **QueueJobsParked** (warning) – `increase(queue_jobs_dead_lettered_total[15m]) > 0`; fires on any dead-letter event.
- **OutboxEventsDead** (warning) – `increase(outbox_events_dead_total[15m]) > 0`; transactional outbox parked an event as dead.
- **WebhookDeliveriesFailingEverywhere** (critical) – zero successful deliveries + > 10 failures in 30 min; indicates a platform-side outage (egress, DNS, signing), not a single subscriber.
- **WebhookRetriesStalled** (warning) – `webhook_deliveries_overdue > 0` sustained 15 min; the retry-sweep cron has stopped moving pending rows.
- **ScheduledJobStale** (warning) – nightly jobs (excluding the four sweeps) have no `job_last_success_timestamp_seconds` within 48 h.
- **FrequentSweepStale** (warning) – `sweep:outbox`, `sweep:payment-effects`, `sweep:reservations` have no success within 30 min.

## Relationships

- **docker/observability/prometheus.config.yaml** – Loads this file via `rule_files`; the alerts here are evaluated by the same Prometheus instance that scrapes the targets defined in the config.
- **docs/modules/webhooks.md** – Cited in the `WebhookDeliveriesFailingEverywhere` alert annotation and comment as the design reference for why per-endpoint failures stay quiet and only fleet-wide failure pages.
- **scripts/ops/sweep-webhook-retries.ts** – The cron job that `WebhookRetriesStalled` monitors; if that script stops running, the `webhook_deliveries_overdue` gauge stays elevated and the alert fires.

## Notes

- `for: 0m` on `QueueJobsParked`, `OutboxEventsDead`, `WebhookDeliveriesFailingEverywhere`, and both "Stale" alerts means the expression must only be true at evaluation time—no sustained-duration buffer. This is intentional: a single dead-letter or a missed sweep tick is already actionable.
- `HighHeapUsage` deliberately divides by `nodejs_heap_size_limit_bytes` (the `--max-old-space-size` ceiling), not `nodejs_heap_size_total_bytes`. The latter sits ≈ 0.97 even on an idle process and would fire permanently.
- `ScheduledJobStale` and `FrequentSweepStale` are split into separate rules because a uniform 48 h threshold would page far too late for 1- or 5-minute sweeps, while a uniform 30-min threshold would page constantly for nightly jobs.
- `WebhookDeliveriesFailingEverywhere` is the only webhook alert marked **critical**; per-endpoint delivery failures are intentionally not surfaced as alerts (see `docs/modules/webhooks.md`).
