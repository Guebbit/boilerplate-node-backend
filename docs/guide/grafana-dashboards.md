# Grafana Dashboards (Phase 5)

> **TL;DR** — Three pre-built dashboard JSON files live in `docs/grafana-dashboards/`. Import them into any Grafana instance (10.x+) and point at your Prometheus, Loki, and Tempo data sources.

---

## Available dashboards

| File                      | Title              | Data sources         | What you get                                               |
| ------------------------- | ------------------ | -------------------- | ---------------------------------------------------------- |
| `api-overview.json`       | API Overview       | Prometheus           | Request rate, latency p50/p95, error rate, in-flight count |
| `logs-and-audit.json`     | Logs & Audit       | Loki (+ Tempo links) | App logs, audit events, error/warn rate                    |
| `distributed-traces.json` | Distributed Traces | Tempo                | Recent traces, slow traces (>500ms)                        |

---

## Import a dashboard

### Via UI (easiest)

1. Grafana → **Dashboards** → **Import**
2. Click **Upload JSON file** and pick one of the files above
3. Map the placeholder data sources (Prometheus / Loki / Tempo) to your actual sources
4. Click **Import**

### Via API

```bash
# Replace DS_PROMETHEUS, DS_LOKI, DS_TEMPO with your actual data source UIDs
curl -X POST http://admin:admin@localhost:3001/api/dashboards/import \
  -H "Content-Type: application/json" \
  -d "{
    \"dashboard\": $(cat docs/grafana-dashboards/api-overview.json),
    \"overwrite\": true,
    \"inputs\": [
      { \"name\": \"DS_PROMETHEUS\", \"type\": \"datasource\", \"pluginId\": \"prometheus\", \"value\": \"<PROMETHEUS_UID>\" }
    ]
  }"
```

---

## Dashboard details

### API Overview (`api-overview.json`)

```text
┌────────────────────────────────┬────────────────────────────────┐
│  Request Rate (req/s)          │  Latency p50 / p95 (ms)        │
│  sum(rate(http_requests...))   │  histogram_quantile(0.95, ...)  │
├──────────────────┬─────────────┴────────────────────────────────┤
│  Error Rate      │  In-Flight Requests                          │
│  errors / total  │  http_requests_in_flight                     │
└──────────────────┴──────────────────────────────────────────────┘
```

Key panels:

- **Request Rate** — `sum(rate(http_requests_total[5m])) by (method, route)`
- **Latency p95** — `histogram_quantile(0.95, sum(rate(http_request_duration_milliseconds_bucket[5m])) by (le, route))`
- **Error Rate** — `sum(rate(http_request_errors_total[5m])) / sum(rate(http_requests_total[5m]))`
- **In-Flight** — `http_requests_in_flight`

---

### Logs & Audit (`logs-and-audit.json`)

```text
┌──────────────────────────────────────────────────────────────────┐
│  Application Logs  {service="api", log_type="app"}               │
│  (Loki)  ← click trace_id to jump to Tempo                       │
├──────────────────────────────────────────────────────────────────┤
│  Audit Events  {service="api", log_type="audit"}                 │
├──────────────────────────────────────────────────────────────────┤
│  Error / Warn Rate  count_over_time(... level=~"error|warn" ...)  │
└──────────────────────────────────────────────────────────────────┘
```

The dashboard has a **Service** variable — switch between services without editing queries.

---

### Distributed Traces (`distributed-traces.json`)

```text
┌──────────────────────────────────────────────────────────────────┐
│  Recent Traces — $service                                        │
│  (Tempo TraceQL search — click any row to see waterfall)         │
├──────────────────────────────────────────────────────────────────┤
│  Slow Traces (>500ms) — $service                                 │
│  { resource.service.name = "$service" && duration > 500ms }      │
└──────────────────────────────────────────────────────────────────┘
```

Click any trace to open the **span waterfall** and see all child spans, durations, and attributes.

---

## Log → Trace correlation in Grafana

1. Configure **Loki data source** → **Derived Fields**:
    - **Name**: `trace_id`
    - **Regex**: `"trace_id":"([a-f0-9]{32})"`
    - Enable **Internal link** → select your Tempo data source
2. Now every Loki log line with a `trace_id` shows a 🔗 icon — click it to jump to Tempo.

---

## Trace → Log correlation in Grafana

1. Configure **Tempo data source** → **Trace to logs**:
    - Data source: Loki
    - Tags: `service`
    - Map tag name: `service.name` → `service`
    - Span start shift: `-1m`, end shift: `1m`
2. Every trace span in Grafana now shows a **Logs for this span** button.

---

## Full observability flow

```text
HTTP Request
     │
     ▼
 App (Node.js)
     ├──► Winston logs  ──► Loki  ──► Grafana "Logs & Audit" dashboard
     └──► OTel spans    ──► Tempo ──► Grafana "Distributed Traces" dashboard
     │                                       ↑
     └──► Prometheus metrics ────────────────┘
                                   Grafana "API Overview" dashboard

Correlation links:
  Loki log  ──► trace_id  ──► Tempo trace
  Tempo span ──► service   ──► Loki logs
```

---

## Related docs

- [Loki Logging](./loki-logging.md) — Winston → Loki setup
- [Grafana Tempo](./tempo.md) — Tempo backend + OTLP config
- [OpenTelemetry Tracing](./opentelemetry-tracing.md) — span creation, trace IDs
- [Prometheus Metrics](./prometheus-metrics.md) — metric list and PromQL
