# docs/tools/prometheus.md

## Purpose

Documents Prometheus as the boilerplate's metrics backend: what `/observability/metrics` exposes, the baseline alert rules, the Alertmanager wiring, the admin-facing observability endpoints, and the SSE metrics stream. Exists so developers know which metrics are available, how to read alerts, and where each config file lives without opening the Prometheus UI.

## Key elements

- **`/observability/metrics`** – the Prometheus scrape target (scraped every 15 s). Exposes `http_requests_total`, `http_request_duration_milliseconds`, `http_request_errors_total`, `http_requests_in_flight`, `cache_invalidation_failures_total`, business counters, and default `prom-client` process/Node metrics.
- **`.docker/observability/prometheus.alert-rules.yaml`** – baseline alert rules: `ApiDown` (critical), `HighErrorRate`, `HighP95Latency`, `HighInFlightRequests`, `HighHeapUsage` (all warning).
- **`.docker/observability/alertmanager.config.yaml`** – Alertmanager routing; uses a `null` receiver in local dev (logs only).
- **Admin observability endpoints** – `/observability/health`, `/observability/metrics/overview`, `/observability/audit`: curated domain-shaped summaries (not raw PromQL results) intended as a data layer for custom frontends.
- **SSE stream `/observability/events`** – public, no auth; emits `metrics.snapshot` on connect, then `metrics.updated` every 5 s and `heartbeat` every 15 s. For live UI widgets, not historical queries.
- **Prometheus UI** `http://localhost:9090` / **Alertmanager UI** `http://localhost:9093` – local entry points.

## Relationships

- **docs/tools/pairing-and-ports.md** – This page defines the ports Prometheus (9090) and Alertmanager (9093) bind to in local dev; the ports reference catalogues those assignments.
- **docs/tools/analytics.md** – The business counters (`auth_login_total`, `cart_checkout_total`, …) and the SSE `metrics.snapshot` / `metrics.updated` events described here are the raw signal that analytics dashboards aggregate.

## Notes

- **`route` label is the Express template, not the raw path.** E.g. `/orders/:id`, or `unmatched` if no handler matched. This is deliberate: deriving the label from the requested URL would let an attacker grow the Prometheus registry without bound (no eviction in `prom-client`). Never switch to the raw path.
- The admin observability endpoints return **curated summaries**, not PromQL results. If you need historical data or ad-hoc queries, hit Grafana's Prometheus Explore view or query Prometheus directly.
- Alertmanager's `null` receiver means **no notifications fire in local dev**—alerts are log-only. Swap the receiver config before pointing it at production traffic.
- Grafana is the primary consumer of this data; you rarely query Prometheus directly. See the Grafana page for dashboard details.
