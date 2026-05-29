# Admin Endpoints

All `/admin/*` routes require **admin JWT** (****** with admin role). They are protected by `getAuth → isAuth → isAdmin` middleware.

## Available endpoints

| Endpoint | Description | Observability equivalent |
| --- | --- | --- |
| `GET /admin/health` | Full health snapshot: DB status, memory, CPU, integrations, uptime | [Grafana](../tools/grafana.md) health panels |
| `GET /admin/metrics` | Curated KPI JSON: HTTP totals, error rate, latency p50/p95, auth & business counters | [Prometheus](../tools/prometheus.md) / [Grafana](../tools/grafana.md) KPI panels |
| `GET /admin/audit` | Recent audit events from the in-memory ring buffer (max 200) | [Loki](../tools/loki.md) log search |
| `GET /admin/orders` | All orders (no user scope) | — |

## Admin API vs Grafana

These endpoints return **the same underlying numbers you see in Grafana, but as a JSON snapshot** — no time axis, no historical trend.

| Admin endpoint | Grafana equivalent | Notes |
| --- | --- | --- |
| `GET /admin/metrics` | Grafana KPI panels | Reads the same prom-client counters/histograms that Prometheus scrapes. Identical numbers, point-in-time. |
| `GET /admin/health` | Grafana health/uptime panels | Overlaps with Prometheus data but also adds Node version, OS info, integration flags. |
| `GET /admin/audit` | Loki log search | **Not** a Prometheus metric. Ring buffer of security/access events — same data Loki ingests via Winston. |

**When to use which:**
- **Grafana** → historical time-series, trends, alerts, operator/SRE workflows.
- **`/admin/*`** → current point-in-time snapshot; data layer for a custom product dashboard without the full Grafana stack.

## GET /admin/health

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

## GET /admin/metrics

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

## GET /admin/audit

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
