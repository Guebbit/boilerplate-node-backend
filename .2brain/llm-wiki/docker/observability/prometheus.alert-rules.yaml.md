---
source: docker/observability/prometheus.alert-rules.yaml
sha256: ce6dafb994f5f6a02db47fee667bdb09c8c48c5943c49e702e658304b69321fa
generated_at: 2026-10-07T23:48:27.974545+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.alert-rules.yaml

## Purpose

Defines the Prometheus alert rules for the local API stack. While dashboards provide visual context, these rules encode the actionable SRE thresholds (availability, error rate, latency, saturation, memory, queue health, security) that drive paging and incident response. It covers both operational health (`api.rules`) and security signals (`security.rules`).

## Key elements

Two rule groups, each containing a set of alert definitions:

**`api.rules`**

- **ApiDown** — `up{job="api"} == 0` for 1 min. Critical; the scrape target is unreachable.
- **HighErrorRate** — 5-minute error ratio > 5 %. Warning.
- **HighP95Latency** — `histogram_quantile(0.95, …)` > 2 000 ms for 5 min. Warning.
- **HighInFlightRequests** — `http_requests_in_flight > 100` for 2 min. Warning.
- **HighHeapUsage** — `nodejs_heap_size_used_bytes / nodejs_heap_size_limit_bytes > 0.90`. Denominator is V8's fixed ceiling, not the committed heap (which would fire permanently).
- **QueueJobsParked** — `increase(queue_jobs_dead_lettered_total[15m]) > 0`. Any dead-letter is the alert; no higher threshold is meaningful.
- **OutboxEventsDead** — Same zero-tolerance pattern on `outbox_events_dead_total`.
- **WebhookDeliveriesFailingEverywhere** — Critical. Zero successes + > 10 failures over 30 min. Signals a platform-side outage (egress, DNS, signing), not a single subscriber endpoint.
- **WebhookRetriesStalled** — `webhook_deliveries_overdue > 0` sustained for 15 min. Indicates the retry-sweep cron is not running.
- **ScheduledJobStale** — `job_last_success_timestamp_seconds` older than 48 h for nightly jobs. Excludes the frequent sweeps (covered by the next rule).
- **FrequentSweepStale** — Same metric, 30-min threshold for `sweep:outbox`, `sweep:payment-effects`, `sweep:reservations` (5-min cadence jobs).

**`security.rules`**

- **LoginFailureRate** — `sum(rate(auth_login_total{status="failure"}[5m])) > 1`. Volume-based stuffing detection.
- **LoginFailureShare** — > 50 % of logins failing **and** total rate > 0.05/s (avoids a single stray failure on a quiet night reading as 100 %).
- **TwoFactorChallengeFailures** — > 0.1/s failed 2FA challenges; password already passed, so this implies a stolen credential.
- **TwoFactorDisableFailures** — Any failure in 15 min (`increase > 0`). Sharpest signal of an active account-takeover attempt.

## Relationships

- **docker/observability/prometheus.config.yaml** — The Prometheus server configuration that loads this file (via `rule_files`). The `job="api"` label referenced in expressions must match the scrape job defined there.
- **scripts/ops/sweep-webhook-retries.ts** — The per-minute cron that re-queues overdue webhook deliveries. The `WebhookRetriesStalled` alert fires when this script stops running (overdue counter stays > 0 for 15 min).
- **docs/modules/webhooks.md** — Referenced by the `WebhookDeliveriesFailingEverywhere` description: per-endpoint delivery failures are intentionally *not* alerted here; this file only pages on fleet-wide (our-side) failure.

## Notes

- **Heap denominator choice is deliberate.** `nodejs_heap_size_total_bytes` (committed heap) sits near 0.97 on an idle process, so the alert would fire permanently. The file uses `nodejs_heap_size_limit_bytes` (the `--max-old-space-size` ceiling) registered by `infrastructure/observability/metrics-registry`.
- **Security thresholds are starting points.** The comments explicitly say "tune to your traffic." A busy deployment will need higher rates; a quiet one may lower them.
- **Zero-tolerance alerts** (`QueueJobsParked`, `OutboxEventsDead`, `TwoFactorDisableFailures`) use `increase(…) > 0` with `for: 0m` — any single occurrence fires immediately. There is no "meaningful threshold above that."
- **ScheduledJobStale excludes frequent sweeps** by name in the `job!~` regex. Those are covered by `FrequentSweepStale` at a 30-min threshold (six missed 5-min runs). A shared 48-hour rule would page 48 h late for a stuck payment or stale reservation.
- Metric sources are registered in `infrastructure/observability/metrics-registry` and `infrastructure/observability/metrics-queue`; label names here must match what those modules export (see `docs/tools/prometheus.md`).
