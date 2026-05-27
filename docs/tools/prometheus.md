# Prometheus (opt-in)

## Status in this repo

Prometheus is **not** wired up by default — the boilerplate does not ship a Prometheus container.
The app, however, exposes a `/metrics` endpoint in the standard Prometheus exposition format, so adding a scrape later is a one-line config change.

If you only care about traces, ignore this page and use [Tempo + Grafana](./tempo.md).

## Health-check routes

These are public, unauthenticated routes used by orchestrators (k8s, Docker healthchecks, load balancers):

| Route       | Purpose                                                                 | Success |
| ----------- | ----------------------------------------------------------------------- | ------- |
| `GET /healthz` | **Liveness** — always 200 while the process is up                   | `200 ok` |
| `GET /readyz`  | **Readiness** — 200 only when both MongoDB and Redis are reachable   | `200 ready` / `503 not ready` |

`/readyz` response body:

```json
{ "mongo": "up", "redis": "up" }
```

If either is down the status is `"down"` and the HTTP status is `503`.

## What `/metrics` exposes

| Metric                                                                                       | Why it is here                                                      |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `http_requests_total`                                                                        | request rate, split by method/route/status                          |
| `http_request_duration_milliseconds`                                                         | latency histogram for p50/p95/p99                                   |
| `http_request_errors_total`                                                                  | 4xx/5xx counts                                                      |
| `http_requests_in_flight`                                                                    | concurrency at a glance                                             |
| `auth_login_total` / `auth_signup_total` / `cart_checkout_total` / `order_created_total` / … | business counters that you cannot derive from traces                |
| `process_*` and `nodejs_*`                                                                   | default `prom-client` runtime metrics (CPU, memory, event-loop, GC) |

Database query metrics are intentionally **not** Prometheus counters — Mongoose spans from OTel give richer per-query data in Tempo.

## Admin observability endpoints

Three additional endpoints sit behind the `/admin` router and require a valid **admin** JWT:

| Route                       | Returns                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /admin/health`         | Full health snapshot: DB status, memory, CPU, integration flags, uptime                    |
| `GET /admin/metrics/summary`| KPI summary: HTTP totals, error rate, in-flight count, p50/p95 latency, business counters  |
| `GET /admin/audit`          | Recent audit events from the in-memory ring buffer (max 200); filterable by query params   |

`/admin/audit` accepts optional query params: `actor`, `action`, `outcome` (`success`/`failure`), `since` (ISO-8601), `limit` (default 50, max 200).

## SSE metrics stream

For a browser/live-dashboard demo, the boilerplate also exposes:

- `GET /observability/events` (`text/event-stream`, public, no auth)

It emits these SSE event types:

| Event              | When                      |
| ------------------ | ------------------------- |
| `metrics.snapshot` | immediately on connect    |
| `metrics.updated`  | every 5 s                 |
| `heartbeat`        | every 15 s (keep-alive)   |

Every event carries the same JSON payload:

```json
{
    "timestamp": "2024-01-01T00:00:00.000Z",
    "uptimeSeconds": 3600,
    "memory": {
        "rss": 62914560,
        "heapUsed": 28311552,
        "heapTotal": 41943040,
        "external": 1234567
    },
    "http": {
        "totalRequests": 142,
        "totalErrors": 3
    },
    "realtime": {
        "websocketConnections": 2,
        "sseClients": 1
    }
}
```

## Add a Prometheus scrape later

```yaml
scrape_configs:
    - job_name: api
      metrics_path: /metrics
      static_configs:
          - targets: ['app:3000']
```

## Useful links

- [Prometheus docs](https://prometheus.io/docs/introduction/overview/)
- [Prometheus exposition format](https://prometheus.io/docs/instrumenting/exposition_formats/)
- [prom-client (Node.js client)](https://github.com/siimon/prom-client#readme)
- [Metric & label naming](https://prometheus.io/docs/practices/naming/)
- [Histogram vs Summary](https://prometheus.io/docs/practices/histograms/)

## Related pages

- [Grafana](./grafana.md)
- [Tempo](./tempo.md)
- [OpenTelemetry](./opentelemetry.md)
