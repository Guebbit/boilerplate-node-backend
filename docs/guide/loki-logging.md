# Loki Centralized Logging (Phase 4)

> **TL;DR** — Set `NODE_LOKI_HOST` and every Winston log line is pushed to Grafana Loki automatically. Nothing else changes.

---

## What is Loki?

```text
Your App ──► Winston Logger ──► LokiTransport ──► Loki ──► Grafana
                │                                             │
                └── Console / File (always on)               └── Query / Alert
```

- **Loki** — log aggregation system (like Elasticsearch, but label-based)
- **Stream labels** — low-cardinality key/value pairs used to filter logs (`service`, `log_type`, `env`)
- **Log line** — the full JSON object (message + all structured fields)
- **Grafana** — UI for querying and visualising Loki logs

---

## Quick start

### 1. Add env var

```bash
# .env
NODE_LOKI_HOST=http://loki:3100
```

That's it. Restart the app — logs now ship to Loki in addition to console and file.

### 2. Verify

Open Grafana → Explore → Loki data source and run:

```logql
{service="api", log_type="app"}
```

You should see structured JSON log entries appear in real time.

---

## How it works

```text
Winston logger
  ├─ Console transport     ← always active
  ├─ File transport        ← always active (errors to error.log)
  └─ LokiTransport         ← only when NODE_LOKI_HOST is set
        │
        └─► POST http://loki:3100/loki/api/v1/push
              stream labels: { service, env, log_type }
              log line:      JSON (timestamp, level, message, traceId, ...)
```

The transport is added at **module load time**. If `NODE_LOKI_HOST` is unset, the logger behaves exactly as before — zero runtime cost.

---

## Stream labels

| Label        | Example value   | Notes                                   |
| ------------ | --------------- | --------------------------------------- |
| `service`    | `api`           | From `NODE_SERVICE_NAME`                |
| `env`        | `production`    | From `NODE_ENV`                         |
| `log_type`   | `app` / `audit` | `app` = main logger, `audit` = audit    |

Keep labels **low-cardinality** — don't put user IDs or request IDs here.

---

## Trace correlation

Every log line includes `trace_id` and `span_id` (set by the request logger middleware). Inside Grafana you can click a log line's `trace_id` field and jump straight to the matching Tempo trace.

```json
{
    "level": "info",
    "message": "GET /products 200 12ms",
    "service": "api",
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "span_id":  "b7ad6b7169203331",
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

To enable the link in Grafana, configure the Loki data source with a **Derived Field**:

| Field         | Value                                    |
| ------------- | ---------------------------------------- |
| Name          | `trace_id`                               |
| Regex         | `"trace_id":"([a-f0-9]{32})"`            |
| URL template  | `http://<grafana-host>:3000/explore?orgId=1&left={"datasource":"tempo","queries":[{"query":"${__value.raw}","queryType":"traceql"}]}`  |

> **Note:** Replace `<grafana-host>` with your actual Grafana hostname or IP (e.g. `localhost`, `grafana`, or a public domain). The default Grafana port is `3000` unless you changed it.

---

## Docker Compose snippet

Paste into your `docker-compose.yml` to run Loki locally:

```yaml
services:
    loki:
        image: grafana/loki:latest
        ports:
            - '3100:3100'
        command: -config.file=/etc/loki/local-config.yaml

    grafana:
        image: grafana/grafana:latest
        ports:
            - '3001:3000'
        environment:
            - GF_AUTH_ANONYMOUS_ENABLED=true
        depends_on:
            - loki
```

Set in your app `.env`:

```bash
NODE_LOKI_HOST=http://loki:3100
```

---

## Environment variables

| Variable          | Default   | Purpose                                  |
| ----------------- | --------- | ---------------------------------------- |
| `NODE_LOKI_HOST`  | _(unset)_ | Loki push API base URL; disables if unset |
| `NODE_SERVICE_NAME` | `api`   | Becomes the `service` stream label       |
| `NODE_ENV`        | `development` | Becomes the `env` stream label       |

---

## File map

```text
src/utils/winston.ts
  ├─ buildLokiTransport()   — creates LokiTransport when NODE_LOKI_HOST is set
  ├─ isLokiEnabled()        — returns true when transport is active
  ├─ logger                 — main app logger (console + file + optional Loki)
  └─ auditLogger            — audit logger  (console + file + optional Loki)
```

---

## Related docs

- [Structured Logging](./structured-logging.md) — log format and fields
- [OpenTelemetry Tracing](./opentelemetry-tracing.md) — trace IDs in logs
- [Grafana Dashboards](./grafana-dashboards.md) — pre-built log panels
