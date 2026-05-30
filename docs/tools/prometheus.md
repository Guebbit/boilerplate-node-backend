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

| Metric                                       | Why it is here                             |
| -------------------------------------------- | ------------------------------------------ |
| `http_requests_total`                        | request rate, split by method/route/status |
| `http_request_duration_milliseconds`         | latency histogram for p50/p95/p99          |
| `http_request_errors_total`                  | 4xx/5xx counts                             |
| `http_requests_in_flight`                    | concurrency at a glance                    |
| `auth_login_total`, `cart_checkout_total`, … | business counters                          |
| `process_*` and `nodejs_*`                   | default `prom-client` runtime metrics      |

## Alert rules

Baseline alert rules live in `.docker/observability/prometheus.alert-rules.yaml`:

| Alert                  | Condition                           | Severity |
| ---------------------- | ----------------------------------- | -------- |
| `ApiDown`              | scrape target unreachable > 1 min   | critical |
| `HighErrorRate`        | error rate > 5 % over 5 min         | warning  |
| `HighP95Latency`       | p95 latency > 2 s over 5 min        | warning  |
| `HighInFlightRequests` | > 100 concurrent requests for 2 min | warning  |
| `HighHeapUsage`        | heap > 90 % for 5 min               | warning  |

## Alertmanager

Alertmanager config lives at `.docker/observability/alertmanager.config.yaml`.
In local dev it uses a `null` receiver (logs only). Replace it with Slack, PagerDuty, or email for production.

## Observability endpoints

See [Observability Endpoints](../api/observability.md) for the full list. Key routes:

| Route                                 | Auth  | Returns                                                                                   |
| ------------------------------------- | ----- | ----------------------------------------------------------------------------------------- |
| `GET /observability/metrics`          | none  | Raw Prometheus exposition (text/plain) — scrape target                                    |
| `GET /observability/health`           | admin | Full health snapshot: DB status, memory, CPU, integration flags, uptime                   |
| `GET /observability/metrics/overview` | admin | KPI summary: HTTP totals, error rate, in-flight count, p50/p95 latency, business counters |
| `GET /observability/audit`            | admin | Recent audit events from the in-memory ring buffer (max 200)                              |

These endpoints return **curated, domain-shaped summaries** — they are the data layer for a custom frontend, not raw Prometheus query results.

## SSE metrics stream

- `GET /observability/events` (`text/event-stream`, public, no auth)

Emits `metrics.snapshot` immediately on connect, then `metrics.updated` every 5 s and a `heartbeat` every 15 s.

Use this for live widgets in a custom UI. For historical charts, query your backend (which can read Prometheus), not process-local memory.

## Useful links

- [Prometheus docs](https://prometheus.io/docs/introduction/overview/)
- [Alertmanager docs](https://prometheus.io/docs/alerting/latest/alertmanager/)
- [prom-client (Node.js client)](https://github.com/siimon/prom-client#readme)
- [PromQL basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)

## Related pages

- [Observability Reference](./observability-reference.md)
- [Grafana](./grafana.md)
- [Tempo](./tempo.md)
- [OpenTelemetry](./opentelemetry.md)
