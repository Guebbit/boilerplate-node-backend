# Observability

This boilerplate includes **traces**, **metrics**, and **log correlation** out of the box.

## What is included

- OpenTelemetry SDK spans for every request, DB query, and email send (Phase 3)
- Trace correlation headers in every response:
    - `x-trace-id`
    - `traceparent`
- Prometheus-compatible metrics endpoint:
    - `GET /metrics`

## Visual flow

```text
Request → OTel SDK (auto-instrument) → trace-context middleware → business route → metrics recorded → response
               │                               │                                           │
         span created                   x-trace-id + traceparent               /metrics exposes prom-client data
         trace_id in logs
```

## Quick code map

### `src/utils/tracing.ts` (Phase 3)

```text
startTracing()
  → NodeSDK init
  → ConsoleSpanExporter (non-production)
  → OTLPTraceExporter (when OTEL_EXPORTER_OTLP_ENDPOINT set)
  → HttpInstrumentation + ExpressInstrumentation

shutdownTracing()
  → sdk.shutdown() (flushes pending spans)
```

### `src/utils/tracer.ts` (Phase 3)

```text
getTracer()           → returns the active tracer
withSpan()            → runs callback inside a named span
getActiveSpanContext() → reads traceId/spanId from active span
setActiveSpanAttributes() → attaches attrs to active span
recordErrorOnActiveSpan() → marks span as error + exception event
```

### `src/utils/observability.ts` (Phase 2)

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

## Traces available

See [OpenTelemetry Tracing](./opentelemetry-tracing.md).

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

- [OpenTelemetry Tracing](./opentelemetry-tracing.md) — spans, exporters, Tempo config
- [Prometheus Metrics](./prometheus-metrics.md) — full metric list, PromQL examples, scrape config
- [Structured Logging](./structured-logging.md) — JSON log format, redaction, request access log
- [Audit Logging](./audit-logging.md) — security and compliance events
