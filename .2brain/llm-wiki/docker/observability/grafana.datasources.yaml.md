---
source: docker/observability/grafana.datasources.yaml
sha256: 250bb3d4e3a9aefde826c0466d57aec2d003a2c8518d1e5e30b1385ea5913288
generated_at: 2026-11-08T02:22:04.815401+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/grafana.datasources.yaml

## Purpose

Grafana datasource provisioning file that auto-wires Grafana to Tempo, Prometheus, and Loki on container start, eliminating manual UI configuration. It also encodes the cross-signal jump logic (trace → logs, trace → service map, log → trace) that makes the three panels interoperate.

## Key elements

- **Tempo datasource** (`uid: tempo`, default) — trace query endpoint at `http://tempo:3200`.
  - `serviceMap.datasourceUid: prometheus` — tells Grafana which Prometheus instance to read service-graph series from (the series themselves are produced by the collector's `servicegraph` connector).
  - `tracesToLogsV2` — enables the "view logs for this trace" jump into Loki; `filterByTraceID: true` scopes the Loki query to the current trace.
  - `tags` mapping (`service.name` → `service`) — maps the span attribute onto the Loki stream label so the generated log query actually matches. Covers both Promtail-promoted Winston logs and Alloy-attached frontend telemetry.
- **Prometheus datasource** (`uid: prometheus`) — metrics endpoint at `http://prometheus:9090`; used for alert-rule visualizations and as the backing store for Tempo's service map.
- **Loki datasource** (`uid: loki`) — log endpoint at `http://loki:3100`.
  - `derivedFields` — regex-extracts `trace_id` from log lines and renders a clickable Tempo link, closing the log → trace loop.
- All three use `access: proxy` (Grafana server proxies the request rather than the browser calling the backend directly).

## Relationships

- **`docker/observability/grafana.dashboard-providers.yaml`** — sibling provisioning file mounted alongside this one into Grafana's `/etc/grafana/provisioning/` directory; together they fully configure a fresh Grafana container (dashboards + datasources).
- **`docker/observability/loki.config.yaml`** — Loki's own config defines how it ingests and labels streams; the `tags` mapping in this file targets the `service` label that Loki exposes, and `derivedFields` matches the `trace_id` key Loki stores per log line.
- **`docker/observability/otel-collector.config.yaml`** — the collector's `servicegraph` connector produces the Prometheus series that Tempo's `serviceMap` reads; this file's comment explicitly references that connector as the data source for the graph.

## Notes

- **`tags` is not optional in a harmless way.** Omitting it does *not* mean "match everything." Grafana falls back to default labels (`cluster`, `hostname`, `namespace`, `pod`, `service.name`) and builds a query like `{service_name="api"}` — a label this stack never sets, so the logs panel opens on an empty result with no visible error. Always keep the `service.name → service` mapping.
- The `service` label is the single shared key: Promtail promotes it from Winston's `service` field, and Alloy attaches it to frontend telemetry. One mapping covers both halves of a stitched trace.
- `derivedFields` matcher uses the OpenTelemetry Logs Data Model key `trace_id` verbatim; the logger renames other OTel fields but not this one.
- Tempo is marked `isDefault: true`, so it becomes the first datasource Grafana selects in the Explore panel.
