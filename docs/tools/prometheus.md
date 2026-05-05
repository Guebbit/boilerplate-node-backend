# Prometheus

## Why Prometheus is here

This boilerplate exposes **machine-readable metrics** so the API can be monitored without guessing.

## What it tracks

- HTTP request counts
- HTTP latency histograms
- in-flight requests
- auth and business counters
- database query counts and errors
- default Node/process metrics

## Metrics flow

```mermaid
flowchart LR
    Request --> Middleware[Observability middleware]
    Middleware --> Metrics[prom-client registry]
    Metrics --> Endpoint[/metrics]
    Endpoint --> Prometheus[Prometheus scrape]
    Prometheus --> Grafana[Grafana dashboards]
```

## Repo-specific value

This repo goes beyond a plain `/metrics` endpoint.
It also exposes admin-oriented summary endpoints and database/domain counters that make the boilerplate feel closer to a production starter.

## Related pages

- [OpenTelemetry](./opentelemetry.md)
- [Grafana](./grafana.md)
- [Winston & Audit Logs](./winston.md)
