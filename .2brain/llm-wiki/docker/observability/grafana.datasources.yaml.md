---
source: docker/observability/grafana.datasources.yaml
sha256: f6ba9f74df9d28a1dc4aeaf3ca7e71c0de22bb41535843ea27654e80a3397c22
generated_at: 2026-11-14T17:11:30.130731+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/grafana.datasources.yaml

## Purpose

Grafana datasource provisioning file. It eliminates manual UI configuration on every container restart by declaring Tempo, Prometheus, and Loki connections declaratively, so Grafana is query-ready the moment it starts.

## Key elements

- **Tempo datasource** (`uid: tempo`, default) — trace backend at `http://tempo:3200`. Carries two cross-datasource integrations:
  - `serviceMap.datasourceUid: prometheus` — enables service-graph panels; the graph *data* comes from the collector's `servicegraph` connector, this setting only tells Grafana which Prometheus to read the resulting series from.
  - `tracesToLogsV2` — enables "view logs for this trace". Maps the span attribute `service.name` to the Loki stream label `service` (the label Alloy promotes from Winston's `service` field).
- **Prometheus datasource** (`uid: prometheus`) — metrics backend at `http://prometheus:9090`.
- **Loki datasource** (`uid: loki`) — log backend at `http://loki:3100`. Declares a `derivedFields` entry that regex-extracts `"trace_id":"(\w+)"` from log lines and renders a clickable Tempo link.

## Relationships

- **otel-collector.config.yaml** — The Tempo `serviceMap` series are produced by the collector's `servicegraph` connector (referenced explicitly in this file's comments); Tempo itself receives OTLP traces from the collector.
- **loki.config.yaml** — Defines how Loki ingests and serves the log streams that this file's `derivedFields` regex and `tracesToLogsV2` query against. The `service` stream label referenced in `tracesToLogsV2.tags` is set by Alloy's log pipeline upstream of Loki.
- **grafana.dashboard-providers.yaml** — Dashboards loaded by that file reference these datasources by the stable `uid` values (`tempo`, `prometheus`, `loki`) rather than by name.

## Notes

- **`tracesToLogsV2.tags` is load-bearing.** Omitting it does *not* mean "match all"; Grafana falls back to default labels (`service_name`, etc.) and builds a query like `{service_name="api"}` that this stack never sets — the panel opens empty with no error. The single `service.name → service` mapping covers both backend and frontend telemetry because Alloy promotes Winston's `service` field into that label for both.
- **`derivedFields` regex is format-specific.** It matches the JSON log shape `"trace_id":"(\w+)"`. If the logger's field renaming or serialization changes, the clickable-trace link silently breaks.
- All `uid` values are stable contract points: other provisioning files and dashboard JSON reference them, so renaming a uid is a breaking change.
- `access: proxy` on every datasource means queries go through Grafana's backend proxy, not the browser — relevant when running behind a network that doesn't expose the backend ports directly.
