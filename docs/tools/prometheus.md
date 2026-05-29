# Prometheus

## What it is

Prometheus is the **metrics backend** of this boilerplate.
It scrapes the app's `/metrics` endpoint every 15 s, stores numeric time-series, evaluates alert rules, and sends firing alerts to Alertmanager.

Grafana reads Prometheus for all metric charts and dashboards.

## Where to find it

- Prometheus UI: `http://localhost:9090`
- Alertmanager UI: `http://localhost:9093`

## Health-check routes

Public, unauthenticated routes for orchestrators and load balancers:

| Route          | Purpose                                                   | Success      |
| -------------- | --------------------------------------------------------- | ------------ |
| `GET /healthz` | **Liveness** — always 200 while the process is up         | `200 ok`     |
| `GET /readyz`  | **Readiness** — 200 only when MongoDB and Redis are up    | `200 ready`  |

## What `/metrics` exposes

| Metric                                                     | Why it is here                                    |
| ---------------------------------------------------------- | ------------------------------------------------- |
| `http_requests_total`                                      | request rate, split by method/route/status        |
| `http_request_duration_milliseconds`                       | latency histogram for p50/p95/p99                 |
| `http_request_errors_total`                                | 4xx/5xx counts                                    |
| `http_requests_in_flight`                                  | concurrency at a glance                           |
| `auth_login_total`, `cart_checkout_total`, …               | business counters                                 |
| `process_*` and `nodejs_*`                                 | default `prom-client` runtime metrics             |

## Alert rules

Baseline alert rules live in `.docker/observability/prometheus/rules/alerts.yml`:

| Alert              | Condition                            | Severity |
| ------------------ | ------------------------------------ | -------- |
| `ApiDown`          | `/metrics` unreachable for > 1 min   | critical |
| `HighErrorRate`    | error rate > 5 % over 5 min          | warning  |
| `HighP95Latency`   | p95 latency > 2 s over 5 min         | warning  |
| `HighInFlightRequests` | > 100 concurrent requests for 2 min | warning |
| `HighHeapUsage`    | heap > 90 % for 5 min                | warning  |

## Alertmanager

Alertmanager config lives at `.docker/observability/alertmanager/alertmanager.yml`.
In local dev it uses a `null` receiver (logs only). Replace it with Slack, PagerDuty, or email for production.

## Admin observability endpoints

These sit behind the `/admin` router and require a valid **admin** JWT:

| Route                        | Returns                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `GET /admin/health`          | Full health snapshot: DB status, memory, CPU, integration flags, uptime           |
| `GET /admin/metrics/summary` | KPI summary: HTTP totals, error rate, in-flight count, p50/p95 latency, business counters |
| `GET /admin/audit`           | Recent audit events from the in-memory ring buffer (max 200)                      |

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

- [Grafana](./grafana.md)
- [Tempo](./tempo.md)
- [OpenTelemetry](./opentelemetry.md)
