# Prometheus

## What it is

Prometheus is the **metrics backend** of this boilerplate.
It scrapes the app's `/observability/metrics` endpoint every 15 s, stores numeric time-series, evaluates alert rules, and sends firing alerts to Alertmanager.

Grafana reads Prometheus for all metric charts and dashboards.

## Where to find it

- Prometheus UI: `http://localhost:9090`
- Alertmanager UI: `http://localhost:9093`

## System ping

| Route   | Purpose                                       | Success  |
| ------- | --------------------------------------------- | -------- |
| `GET /` | **Ping** — always 200 while the process is up | `200 ok` |

## What `/observability/metrics` exposes

| Metric                                       | Why it is here                                                |
| -------------------------------------------- | ------------------------------------------------------------- |
| `http_requests_total`                        | request rate, split by method/route/status                    |
| `http_request_duration_milliseconds`         | latency histogram for p50/p95/p99                             |
| `http_request_errors_total`                  | 4xx/5xx counts                                                |
| `http_requests_in_flight`                    | concurrency at a glance                                       |
| `cache_invalidation_failures_total`          | writes whose stale cached response survived                   |
| `cache_requests_total`                       | `setCache` lookups by outcome — hit/miss/stale/refresh        |
| `rate_limit_store_fallback_total`            | limiter operations served without the `limits` Redis          |
| `rate_limit_refusals_total`                  | requests refused with 429, by budget                          |
| `process_unhandled_rejections_total`         | promise rejections nobody handled (the process keeps running) |
| `queue_jobs_dead_lettered_total`             | jobs parked in a `<queue>.dead`, by queue name                |
| `webhook_delivery_attempts_total`            | outbound webhook delivery attempts, by outcome                |
| `webhook_subscriptions_auto_disabled_total`  | subscriptions auto-disabled for sustained failure             |
| `webhook_deliveries_overdue`                 | pending deliveries more than 10 min past due                  |
| `auth_login_total`, `cart_checkout_total`, … | business counters                                             |
| `process_*` and `nodejs_*`                   | default `prom-client` runtime metrics                         |

The `route` label is the template Express matched — `/orders/:id` — read on `finish`, or
`unmatched` for a request that reached no handler. Never a requested path: prom-client evicts
nothing, and a public deployment is scanned against a near-infinite path dictionary, so a label
derived from the URL grows the registry for the life of the process.

## Alert rules

Baseline alert rules live in `docker/observability/prometheus.alert-rules.yaml`. The `security.rules` group (login, 2FA, audit, 401/403, rate-limit and rejection signals) is sized for a quiet shop: every threshold carries a "tune to your traffic" comment, and none should be trusted before it has seen yours.

| Alert                                | Condition                                                                     | Severity |
| ------------------------------------ | ----------------------------------------------------------------------------- | -------- |
| `ApiDown`                            | scrape target unreachable > 1 min                                             | critical |
| `HighErrorRate`                      | error rate > 5 % over 5 min                                                   | warning  |
| `HighP95Latency`                     | p95 latency > 2 s over 5 min                                                  | warning  |
| `HighInFlightRequests`               | > 100 concurrent requests for 2 min                                           | warning  |
| `HighHeapUsage`                      | heap > 90 % for 5 min                                                         | warning  |
| `QueueJobsParked`                    | any job parked in `<queue>.dead` in the last 15 min                           | warning  |
| `WebhookDeliveriesFailingEverywhere` | zero successful webhook deliveries in 30 min while attempts keep arriving     | critical |
| `WebhookRetriesStalled`              | webhook deliveries stay overdue for 15 min straight                           | warning  |
| `ScheduledJobStale`                  | a nightly `docker/crontab` job has not recorded a success in > 48 h           | warning  |
| `FrequentSweepStale`                 | `sweep:payment-effects` or `sweep:reservations` has not succeeded in > 30 min | warning  |
| `LoginFailureRate`                   | failed logins above 1 per second for 5 min                                    | warning  |
| `LoginFailureShare`                  | over half of logins failing for 10 min, with real traffic                     | warning  |
| `TwoFactorChallengeFailures`         | login-time 2FA failures above 0.1 per second for 10 min                       | warning  |
| `TwoFactorDisableFailures`           | any failed attempt to disable 2FA in 15 min                                   | warning  |
| `AuditSinkFailing`                   | any audit entry not persisted in 5 min                                        | critical |
| `UnauthorizedForbiddenRate`          | 401 and 403 answers above 2 per second for 10 min                             | warning  |
| `RateLimitStoreFallback`             | any limiter operation served without the `limits` Redis in 5 min              | warning  |
| `RateLimitRefusals`                  | one budget refusing over 1 request per second for 10 min                      | warning  |
| `UnhandledRejections`                | any unhandled promise rejection in 15 min                                     | warning  |

## Alertmanager

Alertmanager config lives at `docker/observability/alertmanager.config.yaml`.
In local dev it uses a `null` receiver (logs only). Replace it with Slack, PagerDuty, or email for production.

## Observability endpoints

See [Observability Endpoints](../api/observability.md) for the full list. Key routes:

| Route                                 | Auth          | Returns                                                                                   |
| ------------------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| `GET /observability/metrics`          | metrics token | Raw Prometheus exposition (text/plain) — scrape target                                    |
| `GET /observability/health`           | admin         | Full health snapshot: DB status, memory, CPU, integration flags, uptime                   |
| `GET /observability/metrics/overview` | admin         | KPI summary: HTTP totals, error rate, in-flight count, p50/p95 latency, business counters |
| `GET /observability/audit`            | admin         | Recent incidents from the persisted audit trail, newest first                             |

These endpoints return **curated, domain-shaped summaries** — they are the data layer for a custom frontend, not raw Prometheus query results.

## SSE metrics stream

- `GET /observability/events` (`text/event-stream`, public, no auth)

Emits `metrics.snapshot` immediately on connect, then `metrics.updated` every 5 s and a `heartbeat` every 15 s.

Use this for live widgets in a custom UI. For historical charts, query your backend (which can read Prometheus), not process-local memory.

## Works with

- **[Grafana](./grafana.md)** — Grafana is the primary consumer of Prometheus data. Every metric chart and KPI panel in the dashboard reads from Prometheus. You rarely need to query Prometheus directly; Grafana's Explore view is the normal entry point. → [Works with Prometheus](./grafana.md#works-with)
- **Alertmanager** — Prometheus evaluates the rules in `docker/observability/prometheus.alert-rules.yaml` and pushes firing alerts to Alertmanager, which groups and routes them to notification receivers. In local dev the receiver is `null` (no actual notifications). Swap it for Slack, PagerDuty, or email in production. Both share the same [Observability Reference](./observability-reference.md) config tables.

## External references

- [PromQL basics](https://prometheus.io/docs/prometheus/latest/querying/basics/) — needed to write queries in [Grafana](./grafana.md)'s Prometheus Explore view

## Related pages

- [Observability Reference](./observability-reference.md)
- [Grafana](./grafana.md)
- [Tempo](./tempo.md)
- [OpenTelemetry](./opentelemetry.md)
