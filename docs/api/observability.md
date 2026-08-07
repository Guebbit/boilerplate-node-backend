# Observability Endpoints

The `/observability/*` routes expose operational data for dashboards and monitoring tooling.

- **Public** routes: `/observability/events`, `/observability/metrics`
- **Protected** routes (admin JWT required): `/observability/health`, `/observability/metrics/overview`, `/observability/audit`

## Available endpoints

| Endpoint | Auth | Description | Observability equivalent |
| --- | --- | --- | --- |
| `GET /observability/events` | none | SSE stream: live metrics snapshot every 5 s | — |
| `GET /observability/metrics` | none | Raw Prometheus exposition (text/plain) | [Prometheus](../tools/prometheus.md) scrape target |
| `GET /observability/health` | admin | Full health snapshot: DB status, memory, CPU, integrations, uptime | [Grafana](../tools/grafana.md) health panels |
| `GET /observability/metrics/overview` | admin | Curated KPI JSON: HTTP totals, error rate, latency p50/p95, auth & business counters | [Prometheus](../tools/prometheus.md) / [Grafana](../tools/grafana.md) KPI panels |
| `GET /observability/audit` | admin | Recent audit events from the in-memory ring buffer (max 200) | [Loki](../tools/loki.md) log search |

## Observability API vs Grafana

These endpoints return **the same underlying numbers you see in Grafana, but as a JSON snapshot** — no time axis, no historical trend.

| Endpoint | Grafana equivalent | Notes |
| --- | --- | --- |
| `GET /observability/metrics/overview` | Grafana KPI panels | Reads the same prom-client counters/histograms that Prometheus scrapes. Identical numbers, point-in-time. |
| `GET /observability/health` | Grafana health/uptime panels | Overlaps with Prometheus data but also adds Node version, OS info, integration flags. |
| `GET /observability/audit` | Loki log search | **Not** a Prometheus metric. Ring buffer of security/access events — same data Loki ingests via Winston. |

**When to use which:**
- **Grafana** → historical time-series, trends, alerts, operator/SRE workflows.
- **`/observability/*`** → current point-in-time snapshot; data layer for a custom product dashboard without the full Grafana stack.

## GET /observability/health

Returns system health and integration status.

```json
{
  "status": "ok",
  "environment": "production",
  "service": "boilerplate-node-backend",
  "nodeVersion": "v22.x.x",
  "uptimeSeconds": 3600,
  "database": { "status": "connected" },
  "integrations": {
    "loki": true,
    "posthog": false,
    "otelEnabled": true
  },
  "memory": { "heapUsedMb": 45, "heapTotalMb": 80, "rssMb": 120 },
  "system": { "platform": "linux", "cpuCount": 4, "loadAvg": [0.5, 0.3, 0.2] },
  "timestamp": "2026-05-29T09:00:00.000Z"
}
```

## GET /observability/metrics/overview

Returns curated operational KPIs.

```json
{
  "http": {
    "totalRequests": 12500,
    "totalErrors": 23,
    "errorRate": 0.00184,
    "inFlight": 3,
    "latencyMs": { "p50": 12, "p95": 85 }
  },
  "auth": { "loginSuccess": 340, "loginFailure": 12, "signupSuccess": 58 },
  "business": { "checkoutSuccess": 102, "ordersCreated": 97 },
  "process": { "uptimeSeconds": 3600, "heapUsedMb": 45 },
  "timestamp": "2026-05-29T09:00:00.000Z"
}
```

## GET /observability/audit

Returns recent audit events. Supports query filters:

| Param | Type | Description |
| --- | --- | --- |
| `actor` | string | Filter by actor user ID |
| `action` | string | Filter by action (e.g. `auth.login.failed`) |
| `outcome` | `success` \| `failure` | Filter by outcome |
| `since` | ISO-8601 | Return events after this timestamp |
| `limit` | integer (1–200) | Max events to return (default 50) |

## Related pages

- [Endpoints Overview](./endpoints.md)
- [Grafana](../tools/grafana.md)
- [Prometheus](../tools/prometheus.md)
- [Loki](../tools/loki.md)
- [Winston & Audit Logs](../tools/winston.md)
