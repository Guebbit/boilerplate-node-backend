# Prometheus (opt-in)

## Status in this repo

Prometheus is **not** wired up by default — the boilerplate does not ship a Prometheus container.
The app, however, exposes a `/metrics` endpoint in the standard Prometheus exposition format, so adding a scrape later is a one-line config change.

If you only care about traces, ignore this page and use [Tempo + Grafana](./tempo.md).

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

## SSE metrics demo endpoint

For a browser/live-dashboard demo, the boilerplate also exposes:

- `GET /observability/events` (`text/event-stream`)

It emits:

- `metrics.snapshot` on connect
- `metrics.updated` every 5s
- `heartbeat` every 15s

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
