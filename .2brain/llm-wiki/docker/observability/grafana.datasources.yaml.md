---
source: docker/observability/grafana.datasources.yaml
sha256: 250bb3d4e3a9aefde826c0466d57aec2d003a2c8518d1e5e30b1385ea5913288
generated_at: 2026-10-14T06:50:42.084180+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/grafana.datasources.yaml

## Purpose

Grafana datasource provisioning file that auto-wires Grafana to the three backends (Tempo, Prometheus, Loki) on container start, eliminating the need for manual UI configuration on every restart.

## Key elements

- **Tempo datasource** (default, `uid: tempo`) — trace queries; enables `serviceMap` (service-graph links read from Prometheus) and `tracesToLogsV2` (jump from a span into Loki, filtered by trace ID, with a `service.name → service` tag mapping).
- **Prometheus datasource** (`uid: prometheus`) — metrics and alert-rule visualizations; plain proxy to `http://prometheus:9090`.
- **Loki datasource** (`uid: loki`) — structured log search; defines a `derivedFields` rule that turns `"trace_id":"…"` in log lines into a clickable Tempo link.

## Relationships

- **`prometheus.config.yaml`** — target of the Prometheus datasource URL; also the `datasourceUid` referenced by Tempo's `serviceMap` (the servicegraph connector output lives here).
- **`tempo.config.yaml`** — target of the Tempo datasource URL; also the `datasourceUid` in Loki's `derivedFields` (the clickable trace link points here).
- **`loki.config.yaml`** — target of the Loki datasource URL; the Loki instance Promtail/Alloy ship logs into, which the `tracesToLogsV2` tag query must match.
- **`otel-collector.config.yaml`** — its `servicegraph` connector produces the metric series that Tempo's `serviceMap` reads from Prometheus; its log pipeline is what stamps the `service` label the tag mapping depends on.
- **`grafana.dashboard-providers.yaml`** — dashboards provisioned alongside this file reference the UIDs defined here (`tempo`, `prometheus`, `loki`) to resolve their data panels.

## Notes

- **`tags` is not optional in `tracesToLogsV2`.** Omitting it causes Grafana to fall back to default labels (`cluster`, `hostname`, `namespace`, `pod`, `service.name`) and build a query like `{service_name="api"}` that this stack never populates — the panel silently opens empty with no error.
- The single `service.name → service` tag mapping covers both halves of a stitched trace because Promtail (Winston) and Alloy both attach the `service` stream label.
- `trace_id` in the Loki `derivedFields` regex matches the OpenTelemetry Logs Data Model field name verbatim; the logger renames other fields but not this one.
- Datasource UIDs (`tempo`, `proetheus`, `loki`) are the stable identifiers all cross-references and dashboard panels use — renaming one breaks the links.
