# OpenTelemetry Tracing (Phase 3)

> **TL;DR** — Every request gets a trace. Spans cover HTTP, DB queries, and email sends. Trace IDs appear in every log line.

---

## What is a trace?

```text
Trace = the full journey of one request through the system

   Browser ──► Express ──► Controller ──► Service ──► MongoDB
     │              │            │            │           │
   [span]       [span]       [span]       [span]      [span]
     └────────────── one trace ID ties them all together ──────┘
```

- **Trace** — all work for a single request
- **Span** — one unit of work inside the trace
- **Trace ID** — 32-hex-char ID shared by every span in a trace
- **Span ID** — 16-hex-char ID unique to one span

---

## What is instrumented

| Layer | How | What you get |
|---|---|---|
| HTTP requests | `HttpInstrumentation` (auto) | Span per incoming request |
| Express routes | `ExpressInstrumentation` (auto) | Span per route handler |
| MongoDB queries | Custom Mongoose plugin (manual) | Span per `find` / `save` / etc |
| Email sends | Wrapped in `withSpan()` | Span for each `nodemailer` call |
| Errors | `recordErrorOnActiveSpan()` | Exception event on active span |

---

## Data flow

```text
Incoming HTTP Request
        │
        ▼
┌─────────────────────────────────────────┐
│  OTel HttpInstrumentation               │
│  → starts root span                     │
│  → reads/writes W3C traceparent header  │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Express trace-context middleware        │
│  → reads active OTel span               │
│  → writes traceId → request.traceContext│
│  → writes x-trace-id response header   │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  requestLogger middleware               │
│  → reads traceId from OTel (preferred)  │
│  → emits: { trace_id, span_id, ... }   │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Controllers / Services                 │
│  → withSpan() for key operations        │
│  → setActiveSpanAttributes() for IDs   │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Mongoose plugin (domain-metrics.ts)    │
│  → span per query/save                  │
│  → exception event on error             │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  Span Processors                        │
│  SimpleSpanProcessor → ConsoleExporter  │  ← non-production
│  BatchSpanProcessor  → OTLPExporter     │  ← when OTLP endpoint set
└─────────────────────────────────────────┘
```

---

## Quick start

### 1. Run the app locally

```bash
npm run dev
```

Spans print to stdout (non-production only):

```text
{
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  id: 'a3ce929d0e0e4736',
  name: 'GET /products',
  kind: 1,
  timestamp: 1746208500000000,
  duration: 8321,
  attributes: { 'http.method': 'GET', 'http.route': '/products', 'http.status_code': 200 },
  status: { code: 1 },
  events: []
}
```

### 2. Send a traced request

```bash
# New trace — IDs are generated automatically
curl -i http://localhost:3000/products

# Propagate an existing trace from upstream
curl -i \
  -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-1111111111111111-01" \
  http://localhost:3000/products
```

Response headers you'll see:

```text
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-b7ad6b7169203331-01
x-trace-id:  4bf92f3577b34da6a3ce929d0e0e4736
x-request-id: 550e8400-e29b-41d4-a716-446655440000
```

---

## Connect to Grafana Tempo (or Jaeger)

Set the env var and restart:

```bash
# .env
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318
```

The exporter sends spans to `http://tempo:4318/v1/traces` via OTLP/HTTP.

### Docker Compose snippet

```yaml
services:
  tempo:
    image: grafana/tempo:latest
    ports:
      - "4318:4318"   # OTLP HTTP
      - "3200:3200"   # Tempo query API
    command: ["-config.file=/etc/tempo.yaml"]
    volumes:
      - ./tempo.yaml:/etc/tempo.yaml

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
```

### Minimal Tempo config (`tempo.yaml`)

```yaml
server:
  http_listen_port: 3200

distributor:
  receivers:
    otlp:
      protocols:
        http:
          endpoint: 0.0.0.0:4318

storage:
  trace:
    backend: local
    local:
      path: /tmp/tempo/blocks
```

---

## Add a custom span (example)

```typescript
import { withSpan } from '@utils/tracer';

// Wrap any async operation in a named span.
const result = await withSpan(
    'cart.checkout',
    async (span) => {
        span.setAttribute('user.id', userId);
        return await cartService.checkout(userId);
    }
);
```

Or set attributes on the currently active span:

```typescript
import { setActiveSpanAttributes } from '@utils/tracer';

setActiveSpanAttributes({ 'order.id': orderId, 'order.total': total });
```

---

## Trace ID in logs

Every request log line includes `trace_id` and `span_id`:

```json
{
  "level": "info",
  "message": "GET /products 200 12.3ms",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "b7ad6b7169203331",
  "method": "GET",
  "route": "/products",
  "status_code": 200,
  "duration_ms": 12.3
}
```

Use `trace_id` to jump from a Loki log entry directly to the corresponding Tempo trace.

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(unset)_ | Tempo / Jaeger OTLP base URL |
| `OTEL_EXPORTER_OTLP_HEADERS` | _(unset)_ | Comma-separated `key=value` auth headers |
| `NODE_SERVICE_NAME` | `api` | Service name in every span |

---

## File map

```text
src/utils/tracing.ts
  ├─ startTracing()       — initialize NodeSDK, register processors
  └─ shutdownTracing()    — flush spans and shut down (called on server stop)

src/utils/tracer.ts
  ├─ getTracer()               — returns the active OTel tracer
  ├─ withSpan()                — run a callback inside a named span
  ├─ getActiveSpanContext()    — read traceId/spanId from the active span
  ├─ setActiveSpanAttributes() — attach attributes to the current span
  └─ recordErrorOnActiveSpan() — mark span as error + record exception

src/app.ts
  ├─ import tracing (first import — enables auto-instrumentation)
  ├─ trace-context middleware  — writes OTel IDs to request.traceContext
  └─ error handler             — recordErrorOnActiveSpan() on every error

src/utils/domain-metrics.ts
  └─ mongooseMetricsPlugin     — Mongoose pre/post hooks create DB spans

src/utils/nodemailer.ts
  └─ nodemailer()              — email send wrapped in withSpan('email.send')

src/middlewares/request-logger.ts
  └─ requestLogger             — reads OTel span context for trace_id in logs
```

---

## Related docs

- [Observability](./observability.md) — overview of traces, metrics, headers
- [Prometheus Metrics](./prometheus-metrics.md) — metric list, PromQL
- [Structured Logging](./structured-logging.md) — log format with trace IDs
