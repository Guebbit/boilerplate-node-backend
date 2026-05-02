# Observability

This boilerplate includes **traces** and **metrics** out of the box.

## What is included

- Trace correlation headers in every response:
    - `x-trace-id`
    - `traceparent`
- Prometheus-compatible metrics endpoint:
    - `GET /metrics`

## Visual flow

```text
Request → trace context middleware → business route → metrics recorded → response
               |                                              |
         x-trace-id + traceparent                  /metrics exposes prom-client data
```

## Quick code map (`src/utils/observability.ts`)

```text
createTraceContext()
  → parseTraceparent() (if header exists)
  → generateTraceId()/generateSpanId() fallback

recordRequestMetric()
  → httpRequestsTotal.inc()
  → httpRequestDuration.observe()
  → httpRequestErrorsTotal.inc() (4xx/5xx only)

incrementInflight() / decrementInflight()
  → httpInflightRequests gauge

getPrometheusMetrics()
  → metricsRegistry.metrics()  (prom-client)
```

## Metrics available

See the full list in [Prometheus Metrics](./prometheus-metrics.md).

Quick reference:
- `http_requests_total{method,route,status_code}`
- `http_request_duration_milliseconds_*` (histogram)
- `http_request_errors_total{method,route,status_code}`
- `http_requests_in_flight`
- `process_uptime_seconds`
- `process_resident_memory_bytes`
- `nodejs_eventloop_lag_seconds` (and more via `collectDefaultMetrics`)

## Examples

```bash
# Basic request (new trace generated)
curl -i http://localhost:3000/

# Propagate trace from upstream
curl -i \
  -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-1111111111111111-01" \
  http://localhost:3000/orders

# Read metrics
curl http://localhost:3000/metrics
```

## Related docs

- [Prometheus Metrics](./prometheus-metrics.md) — full metric list, PromQL examples, scrape config
- [Structured Logging](./structured-logging.md) — JSON log format, redaction, request access log
- [Audit Logging](./audit-logging.md) — security and compliance events
