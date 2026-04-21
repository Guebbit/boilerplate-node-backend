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
Request -> trace context middleware -> business route -> metrics recorded -> response
                     |                                               |
               x-trace-id + traceparent                      /metrics exposes counters/histograms
```

## Quick code map (`src/utils/observability.ts`)

```text
createTraceContext()
  -> parseTraceparent() (if header exists)
  -> generateTraceId()/generateSpanId() fallback

recordRequestMetric()
  -> http_requests_total (counter)
  -> http_request_duration_milliseconds_* (histogram)

getPrometheusMetrics()
  -> renderCounterMetrics()
  -> renderHistogramMetrics()
  -> renderProcessMetrics()
```

Use this map when reading the file from top to bottom.

## Metrics available

- `http_requests_total{method,route,status_code}`
- `http_request_duration_milliseconds_*` (histogram)
- `process_uptime_seconds`
- `process_resident_memory_bytes`

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
