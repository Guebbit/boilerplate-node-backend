# Observability Endpoints

The `/observability/*` routes expose operational data for dashboards and monitoring tooling.

**None of these are public.** `/observability/events` and `/observability/metrics` each carry
their own guard rather than the admin JWT, because neither caller can present one: an
`EventSource` cannot set an `Authorization` header, and a Prometheus scraper is not a user.

- **Admin JWT**: `/observability/health`, `/observability/metrics/overview`, `/observability/audit`
- **Admin cookie**: `/observability/events` (`isAdminViaCookie`)
- **Scrape credential**: `/observability/metrics` (`isMetricsScraper` — `Bearer $NODE_METRICS_TOKEN`; with the variable unset the route answers 503 to everyone)

## Available endpoints

| Endpoint | Auth | Description | Observability equivalent |
| --- | --- | --- | --- |
| `GET /observability/events` | admin cookie | SSE stream: live metrics snapshot every 5 s | [Frontend Observability](../tools/frontend-observability.md) |
| `GET /observability/metrics` | scraper | Raw Prometheus exposition (text/plain) | [Prometheus](../tools/prometheus.md) scrape target |
| `GET /observability/health` | admin | Full health snapshot: DB status, memory, CPU, integrations, uptime | [Grafana](../tools/grafana.md) health panels |
| `GET /observability/metrics/overview` | admin | Curated KPI JSON: HTTP totals, error rate, latency p50/p95, auth & business counters | [Prometheus](../tools/prometheus.md) / [Grafana](../tools/grafana.md) KPI panels |
| `GET /observability/audit` | admin | Recent audit events from the persisted audit trail, newest first | [Loki](../tools/loki.md) log search |

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

The **readiness** answer: can this instance serve what it promises, and which backing service is
missing when it cannot.

This is not the liveness probe. `GET /` is, and it is what the container HEALTHCHECK calls — see
[The Observability Layer](../tools/observability-layer.md) for why the two must stay separate.

```json
{
  "status": "ok",
  "environment": "production",
  "service": "boilerplate-node-backend",
  "nodeVersion": "v22.x.x",
  "uptimeSeconds": 3600,
  "dependencies": {
    "database": { "status": "ready" },
    "cache": { "status": "ready" },
    "queue": { "status": "disabled" }
  },
  "telemetry": {
    "loki": true,
    "otel": true,
    "umami": true,
    "faro": false,
    "analytics": { "provider": "umami", "configured": true }
  },
  "memory": { "rss": 125829120, "heapUsed": 47185920, "heapTotal": 83886080, "external": 2097152 },
  "system": { "platform": "linux", "cpuCount": 4, "loadAvg": [0.5, 0.3, 0.2] },
  "timestamp": "2026-05-29T09:00:00.000Z"
}
```

`status` is `ok` when every dependency is `ready` or `disabled`, and `degraded` otherwise.

| Dependency status | Means                                                                              |
| ----------------- | ------------------------------------------------------------------------------------ |
| `ready`           | connected and usable                                                                |
| `connecting`      | handshake in flight — a deploy inside its start-up grace period, not an outage      |
| `unavailable`     | configured but not reachable                                                        |
| `disabled`        | not configured in this deployment. A supported state: it never degrades `status`    |

`telemetry` reports which sinks this deployment is **wired to**, read off the environment and never
probed. It is deliberately outside the `status` fold: losing a telemetry sink costs visibility, not
capability — an unreachable Loki does not make a checkout fail.

`analytics` carries two facts because neither answers on its own. `provider` is a choice between
three implementations, so a boolean could not tell "PostHog is unconfigured" from "this deployment
uses Umami". `configured` is whether that provider has the credentials it needs: a provider selected
without them warns once at boot and then discards every event for the life of the process, which is
the most common analytics failure there is. `none` is always configured — collecting nothing is its
configuration. Note that `umami` above is a different fact: the public origin a browser loads the
tracking script from, which says nothing about the website id the API needs.

`memory` is in **bytes**, identical to what the SSE stream publishes, so a dashboard showing both
compares numbers instead of converting units.

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
