---
source: docker/observability/prometheus.alert-rules.yaml
sha256: 194f73cda65d6a46d7ec9bb5917bb50649b9e844a3909d76ea0d8cc0cace8135
generated_at: 2026-11-08T02:22:53.733253+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.alert-rules.yaml

## Purpose

Defines the starter set of Prometheus alert rules for the local API stack, covering the four golden-signal categories (availability, errors, latency, saturation) plus domain-specific concerns (dead-letter queues, outbox poison events, webhook delivery, scheduled jobs). It converts raw metrics into actionable SRE thresholds with severity labels and human-readable annotations for Alertmanager.

## Key elements

- **Group `api.rules`** — single rule group; all alerts live here.
- **ApiDown / ApiRestarting** — availability pair: `up == 0` for 1 min; crash-loop via `changes(process_start_time_seconds[15m]) > 2`. `ApiDown` mutes `ApiRestarting` (see Alertmanager inhibit rules).
- **DependencyUnavailable** (two rules, one name) — `dependency_up` gauge from `modules/observability/metrics.ts`. Database → critical / 1 min; cache & queue → warning / 5 min.
- **HighErrorRate** — 5xx ratio > 5 % over 5 min. Deliberately excludes 4xx.
- **HighP95Latency** — `histogram_quantile(0.95, …)` > 2 000 ms.
- **HighInFlightRequests** — `http_requests_in_flight > 100`.
- **HighHeapUsage** — `nodejs_heap_size_used_bytes / nodejs_heap_size_limit_bytes > 0.90`. Denominator is V8's fixed ceiling (`--max-old-space-size`), *not* the growing `total` metric.
- **QueueJobsParked / OutboxEventsDead** — any `increase(…_total[15m]) > 0` fires; zero is the only "healthy" state.
- **WebhookDeliveriesFailingEverywhere** — zero successes *and* > 10 failures in 30 min; signals platform-side egress/DNS/signing outage, not a single subscriber issue.
- **WebhookRetriesStalled** — `webhook_deliveries_overdue > 0` persisting 15 min means the retry-sweep cron stopped.
- **ScheduledJobStale** — `time() - job_last_success_timestamp_seconds > 2×86400`; excludes the four frequent sweep tasks.
- **ScheduledJobNeverSucceeded** — `job_last_run_timestamp_seconds unless on(task) job_last_success_timestamp_seconds`; catches jobs that ran but have no success series at all.

## Relationships

- **docker/observability/prometheus.config.yaml** — Prometheus loads this file as its `rule_files` entry; scrapes defined there (notably `job="api"`) supply the metric series referenced by every expression here.
- **docker/observability/prometheus.alert-rules.test.yaml** — test/development variant of the same rule set; changes here are expected to be mirrored (or intentionally diverged) in that file.
- **alertmanager.config.template.yaml** (referenced in comments) — defines `inhibit_rules` that silence downstream alerts (e.g. `HighErrorRate`) while `DependencyUnavailable{database}` is firing.

## Notes

- **Same alert name, two rules:** `DependencyUnavailable` appears twice with different `severity`. Alertmanager treats them as one logical alert with multiple instances.
- **ApiRestarting + clustering:** with `NODE_ENABLE_CLUSTERING` on, each scrape hits a different worker and `process_start_time_seconds` jumps between them, making the `changes()` check unreliable. The comment explicitly marks it as a known limitation.
- **Heap denominator:** using `nodejs_heap_size_total_bytes` (committed, grows on demand) instead of `nodejs_heap_size_limit_bytes` (fixed V8 ceiling) would keep the ratio ≈ 0.97 at idle and page constantly. The `limit` metric is registered in `infrastructure/observability/metrics-registry`.
- **`or vector(0)` idiom** in `WebhookDeliveriesFailingEverywhere`: guards against the success series not existing at all (no successful delivery ever recorded), which would make the `sum` return an empty vector and the `and` never match.
- **ScheduledJobStale exclusion list:** the four `sweep:*` tasks run every 1–5 min; a 48-hour threshold would either page on them constantly or let a real failure sit a full 48 h. They have their own purpose-built alerts above.
- **Severity convention:** `critical` for things that take the API down or lose data (ApiDown, ApiRestarting, database, all-webhooks-failing); `warning` for degraded-but-operational states (cache/queue, 5xx rate, latency, in-flight, heap, dead-letters, stalled sweeps, job staleness).
