# Grafana Tempo — Distributed Tracing Backend (Phase 5)

> **TL;DR** — Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318` and all OpenTelemetry spans are shipped to Tempo. Grafana connects to Tempo so you can visualise and search traces.

---

## What is Tempo?

```text
Your App ──► OTLPExporter ──► Tempo ──► Grafana
              (BatchSpanProcessor)         │
                                           └── Explore Traces
                                               Correlate with Loki logs
```

- **Tempo** — distributed trace storage backend by Grafana Labs
- **OTLP** — OpenTelemetry Protocol; the standard trace wire format
- **Trace** — the full journey of one request through your system
- **Span** — one unit of work within a trace (HTTP handler, DB query, etc.)

---

## Data flow

```text
Incoming HTTP request
        │
        ▼
 OTel HttpInstrumentation  ← auto-creates root span
        │
        ▼
 Express route handler
        │
        ▼
 Controller / Service      ← withSpan() creates child spans
        │
        ▼
 Mongoose plugin           ← DB query spans
        │
        ▼
 BatchSpanProcessor        ← buffers spans, flushes every N ms
        │
        ▼
 OTLPTraceExporter
        │  POST /v1/traces
        ▼
 Grafana Tempo             ← stores and indexes spans
        │
        ▼
 Grafana UI                ← search, waterfall, service map
```

---

## Quick start

### 1. Set the env var

```bash
# .env
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318
```

Restart the app — spans are now batched and sent to Tempo.

### 2. Verify

Open Grafana → Explore → Tempo data source and search by service name:

```
{ resource.service.name = "api" }
```

Click any trace to see the waterfall view of all spans.

---

## Docker Compose snippet

```yaml
services:
    tempo:
        image: grafana/tempo:latest
        ports:
            - '4318:4318'   # OTLP HTTP receiver
            - '3200:3200'   # Tempo query API
        command: ['-config.file=/etc/tempo.yaml']
        volumes:
            - ./tempo.yaml:/etc/tempo.yaml

    grafana:
        image: grafana/grafana:latest
        ports:
            - '3001:3000'
        environment:
            - GF_AUTH_ANONYMOUS_ENABLED=true
        depends_on:
            - tempo
```

### Minimal `tempo.yaml`

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

## Add Tempo as a Grafana data source

1. **Grafana** → **Connections** → **Data Sources** → **Add** → choose **Tempo**
2. Set **URL** to `http://tempo:3200`
3. Under **Trace to logs** section:
   - Data source: **Loki**
   - Tags: `service`
   - Map tag: `service` → `service`
   - Span start time shift: `-1m`
   - Span end time shift: `1m`
4. Click **Save & Test**

This makes every span in Grafana show a **"Logs for this span"** button that queries Loki with the matching `trace_id`.

---

## Log/trace correlation

Trace IDs from OpenTelemetry appear in every log line written by the app:

```json
{
    "level": "info",
    "message": "GET /products 200 12ms",
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "span_id":  "b7ad6b7169203331"
}
```

Configure a **Derived Field** in the Loki data source to create a clickable link:

| Field        | Value                                             |
| ------------ | ------------------------------------------------- |
| Name         | `trace_id`                                        |
| Regex        | `"trace_id":"([a-f0-9]{32})"`                     |
| URL template | `${__value.raw}` → point to your Tempo data source |
| Internal link | enable → select Tempo data source               |

Result: click `trace_id` in a Loki log entry → open the matching trace in Tempo.

---

## Authentication / headers

For Grafana Cloud or multi-tenant Tempo, add headers to every OTLP request:

```bash
# .env
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <token>,X-Scope-OrgID=default
```

The header format is comma-separated `key=value` pairs.

---

## Environment variables

| Variable                      | Default   | Purpose                                   |
| ----------------------------- | --------- | ----------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(unset)_ | Tempo base URL; disables remote export if unset |
| `OTEL_EXPORTER_OTLP_HEADERS`  | _(unset)_ | Comma-separated `key=value` auth headers  |
| `NODE_SERVICE_NAME`           | `api`     | `service.name` attribute on every span    |

---

## File map

```text
src/utils/tracing.ts
  ├─ startTracing()         — initialises NodeSDK + processors
  │     ├─ ConsoleSpanExporter  (non-production stdout)
  │     └─ OTLPTraceExporter    (when OTEL_EXPORTER_OTLP_ENDPOINT is set)
  └─ shutdownTracing()      — flush + shut down (called on server stop)

src/utils/tracer.ts
  ├─ withSpan()             — run a callback inside a named child span
  ├─ getActiveSpanContext() — read traceId/spanId from the active span
  └─ recordErrorOnActiveSpan() — mark span as ERROR + record exception

src/utils/domain-metrics.ts
  └─ mongooseMetricsPlugin  — Mongoose pre/post hooks create DB spans
```

---

## Related docs

- [OpenTelemetry Tracing](./opentelemetry-tracing.md) — SDK setup, custom spans, code examples
- [Loki Logging](./loki-logging.md) — structured logs with trace IDs
- [Grafana Dashboards](./grafana-dashboards.md) — pre-built trace panels
