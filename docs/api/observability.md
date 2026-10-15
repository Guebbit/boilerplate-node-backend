# Observability Endpoints

The `/observability/*` routes expose operational data for dashboards and monitoring tooling.

**None of these are public.** Every one of them is a PLATFORM-scope route: they answer about the
installation, not about one shop, so the key they check is `read:ObservabilitySnapshot` and a
shop's own unrestricted role can never satisfy it — see
[Authorization](../theory/authorization.md). `/observability/events` and `/observability/metrics`
each carry their own guard rather than a bearer token, because neither caller can present one: an
`EventSource` cannot set an `Authorization` header, and a Prometheus scraper is not a user.

- **`read:ObservabilitySnapshot` via bearer token**: `/observability/health`, `/observability/metrics/overview`, `/observability/audit`
- **`read:ObservabilitySnapshot` via refresh cookie**: `/observability/events` (`requirePermissionViaCookie`)
- **Scrape credential**: `/observability/metrics` (`isMetricsScraper` — `Bearer $NODE_METRICS_TOKEN`; with the variable unset the route answers 503 to everyone)

## Available endpoints

| Endpoint | Auth | Description | Observability equivalent |
| --- | --- | --- | --- |
| `GET /observability/events` | `read:ObservabilitySnapshot`, by cookie | SSE stream: live metrics snapshot every 5 s | [Frontend Observability](../tools/frontend-observability.md) |
| `GET /observability/metrics` | scraper | Raw Prometheus exposition (text/plain) | [Prometheus](../tools/prometheus.md) scrape target |
| `GET /observability/health` | `read:ObservabilitySnapshot` | Full health snapshot: DB status, memory, CPU, integrations, uptime | [Grafana](../tools/grafana.md) health panels |
| `GET /observability/metrics/overview` | `read:ObservabilitySnapshot` | Curated KPI JSON: HTTP totals, error rate, latency p50/p95, auth & business counters | [Prometheus](../tools/prometheus.md) / [Grafana](../tools/grafana.md) KPI panels |
| `GET /observability/audit` | `read:ObservabilitySnapshot` | A page of incident events from the persisted audit trail, newest first | [Loki](../tools/loki.md) log search |

## Observability API vs Grafana

These endpoints return **the same underlying numbers you see in Grafana, but as a JSON snapshot** — no time axis, no historical trend.

| Endpoint | Grafana equivalent | Notes |
| --- | --- | --- |
| `GET /observability/metrics/overview` | Grafana KPI panels | Reads the same prom-client counters/histograms that Prometheus scrapes. Identical numbers, point-in-time. |
| `GET /observability/health` | Grafana health/uptime panels | Overlaps with Prometheus data but also adds Node version, OS info, integration flags. |
| `GET /observability/audit` | Loki log search | **Not** a Prometheus metric. Persisted incident events — security/access refusals, the kind of data Loki also ingests via Winston. |

**When to use which:**
- **Grafana** → historical time-series, trends, alerts, operator/SRE workflows.
- **`/observability/*`** → current point-in-time snapshot; data layer for a custom product dashboard without the full Grafana stack.

## GET /observability/health

The **readiness** answer: can this instance serve what it promises, and which backing service is
missing when it cannot.

This is neither the liveness probe (`GET /livez`) nor the load-balancer readiness check (`GET /readyz`)
— see [The Observability Layer](../tools/observability-layer.md#the-four-properties-any-change-has-to-preserve)
for how the three divide up.

```json
{
  "status": "ok",
  "environment": "production",
  "service": "boilerplate-node-backend",
  "runtimeVersion": "v24.x.x",
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
  "jobs": [{ "name": "reap-orders", "lastSuccessAt": "2026-05-29T08:00:00.000Z" }],
  "queues": [{ "name": "worker.email.send", "parked": 0 }],
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

`jobs` is each lease-guarded job's last observed outcome (`lastSuccessAt`, `lastError`), and `queues`
the current dead-letter depth per worker queue. Like `telemetry`, neither folds into `status`; `queues`
is absent when the broker is disabled or unreachable. See [ops](../reference/ops.md#scheduled-jobs).

`memory` is in **bytes**, identical to what the SSE stream publishes, so a dashboard showing both
compares numbers instead of converting units.

## GET /observability/metrics/overview

Returns curated operational KPIs. `business` is absent in a build without the modules that own those counters.

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
  "business": { "checkoutSuccess": 102, "ordersCreated": 97, "lowStockProducts": 4, "reservedUnits": 12 },
  "database": { "queriesTotal": 9000, "errorsTotal": 1 },
  "process": { "uptimeSeconds": 3600, "memory": { "rss": 125829120, "heapUsed": 47185920, "heapTotal": 83886080, "external": 2097152 } },
  "timestamp": "2026-05-29T09:00:00.000Z"
}
```

## GET /observability/audit

Returns a page of the platform's INCIDENT events (security refusals, failed sign-ins, worker failures), newest first, addresses pseudonymised. What customers did is the admin's `GET /audit`. Supports query filters:

| Param | Type | Description |
| --- | --- | --- |
| `actor` | string | Filter by actor user ID |
| `action` | string | Filter by action (e.g. `order.created`) |
| `outcome` | `success` \| `failure` | Filter by outcome |
| `since` | ISO-8601 | Return events strictly after this timestamp |
| `page`, `pageSize` | integer | Standard pagination; the response carries `meta` with `totalItems` counting every matching incident |

## Related pages

- [Endpoints Overview](./endpoints.md)
- [Grafana](../tools/grafana.md)
- [Prometheus](../tools/prometheus.md)
- [Loki](../tools/loki.md)
- [Winston & Audit Logs](../tools/winston.md)
