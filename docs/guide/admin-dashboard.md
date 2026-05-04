# Admin Dashboard Contract

> **Who is this for?** Frontend engineers building `Admin.vue` or any admin/ops dashboard.

## TL;DR

The backend exposes **three admin-only endpoints** for dashboard visualization:

| Endpoint                     | What you get                                            |
| ---------------------------- | ------------------------------------------------------- |
| `GET /admin/health`          | System status, DB, memory, integrations                 |
| `GET /admin/metrics/summary` | KPI counters: requests, errors, latency, auth, business |
| `GET /admin/audit`           | Recent security/admin events with filters               |

All require a **Bearer admin token** (`Authorization: Bearer <token>`).

---

## Architecture

```
Admin.vue
├─ useAdminHealth      → GET /admin/health
├─ useAdminMetrics     → GET /admin/metrics/summary
└─ useAdminAudit       → GET /admin/audit
```

The raw Prometheus text endpoint (`GET /metrics`) is **not** meant for browsers — use `/admin/metrics/summary` instead.

---

## Endpoints

### `GET /admin/health`

Full health snapshot.

**Response shape:**

```json
{
    "success": true,
    "data": {
        "status": "ok",
        "environment": "production",
        "service": "api",
        "nodeVersion": "v20.x.x",
        "uptimeSeconds": 3600,
        "database": { "status": "connected" },
        "integrations": {
            "loki": false,
            "posthog": false,
            "otelEnabled": true
        },
        "memory": {
            "heapUsedMb": 45,
            "heapTotalMb": 128,
            "rssMb": 80
        },
        "system": {
            "platform": "linux",
            "cpuCount": 4,
            "loadAvg": [0.1, 0.2, 0.15]
        },
        "timestamp": "2026-05-03T12:00:00.000Z"
    }
}
```

**Dashboard use:** top status card, uptime badge, memory bar, DB indicator.

---

### `GET /admin/metrics/summary`

Derived JSON metrics from Prometheus counters/histograms. Safe for browser dashboards.

**Response shape:**

```json
{
    "success": true,
    "data": {
        "http": {
            "totalRequests": 12500,
            "totalErrors": 42,
            "errorRate": 0.0034,
            "inFlight": 3,
            "latencyMs": { "p50": 25, "p95": 120 }
        },
        "auth": {
            "loginSuccess": 310,
            "loginFailure": 8,
            "signupSuccess": 22
        },
        "business": {
            "checkoutSuccess": 95,
            "ordersCreated": 95
        },
        "database": {
            "queriesTotal": 4800,
            "errorsTotal": 1
        },
        "process": {
            "uptimeSeconds": 3600,
            "heapUsedMb": 45
        },
        "timestamp": "2026-05-03T12:00:00.000Z"
    }
}
```

**Dashboard use:** KPI cards (requests/min, error rate, latency p95), auth funnel, order/checkout counters.

---

### `GET /admin/audit`

Recent audit events from the in-memory ring buffer (last 200 max, newest first).

**Query params:**

| Param     | Type                   | Description              |
| --------- | ---------------------- | ------------------------ |
| `actor`   | string                 | Filter by user ID        |
| `action`  | string                 | e.g. `auth.login.failed` |
| `outcome` | `success` \| `failure` | Filter by outcome        |
| `since`   | ISO-8601 datetime      | Events after this time   |
| `limit`   | 1–200 (default 50)     | Max events returned      |

**Response shape:**

```json
{
    "success": true,
    "data": {
        "total": 2,
        "items": [
            {
                "actor_user_id": "anonymous",
                "actor_role": "anonymous",
                "action": "auth.login.failed",
                "outcome": "failure",
                "ip": "127.0.0.1",
                "request_id": "a1b2c3",
                "trace_id": "abc123...",
                "timestamp": "2026-05-03T11:59:01.000Z",
                "level": "warn"
            }
        ]
    }
}
```

**Dashboard use:** security feed, failed login table, admin action history, export for incident review.

**Action names (examples):**

| Action                  | Meaning                     |
| ----------------------- | --------------------------- |
| `auth.login.succeeded`  | Successful login            |
| `auth.login.failed`     | Failed login attempt        |
| `auth.signup.succeeded` | New user registered         |
| `security.unauthorized` | 401 — missing/expired token |
| `security.forbidden`    | 403 — wrong role            |
| `admin.user.created`    | Admin created a user        |
| `admin.product.deleted` | Admin deleted a product     |

> **Limitation:** The ring buffer holds up to 200 events in memory and resets on restart.
> For persistent audit history, configure Loki (`NODE_LOKI_HOST` env var) and query Grafana.

---

## OpenAPI contract

All three endpoints are fully documented in [`openapi.yaml`](../../openapi.yaml) under the **Admin** tag:

- `GET /admin/health` → `operationId: getAdminHealth`
- `GET /admin/metrics/summary` → `operationId: getAdminMetricsSummary`
- `GET /admin/audit` → `operationId: getAdminAuditLogs`

New schemas added: `AdminHealth`, `AdminHealthResponse`, `AdminMetricsSummary`, `AdminMetricsSummaryResponse`, `AuditEventItem`, `AuditLogsResponse`.

---

## Frontend integration hints

```ts
// Composable skeleton
const { data: health } = useFetch('/admin/health', { headers: authHeaders });
const { data: metrics } = useFetch('/admin/metrics/summary', { headers: authHeaders });
const { data: audit } = useFetch('/admin/audit?limit=20', { headers: authHeaders });
```

Refresh intervals:

- Health: every 30s
- Metrics: every 60s
- Audit: on user action or every 5min

---

## External observability links

These are not API endpoints — link to them from the admin UI:

| Tool    | URL template                          |
| ------- | ------------------------------------- |
| Grafana | `NODE_GRAFANA_URL` env                |
| Loki    | Grafana Explore with `log_type=audit` |
| Tempo   | Grafana Explore with trace ID         |
| PostHog | `NODE_POSTHOG_HOST` env               |
