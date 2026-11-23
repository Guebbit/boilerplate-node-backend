---
source: docker/observability/grafana.datasources.yaml
source_sha256: f6ba9f74df9d28a1dc4aeaf3ca7e71c0de22bb41535843ea27654e80a3397c22
context_sha256: a0bb5c0a42bc351b597524cba809375b53b32c598784d3573a14efa0ef8b47cc
generated_at: 2026-11-22T01:32:15.989023+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/observability/grafana.datasources.yaml

## Purpose
Grafana datasource provisioning file. It auto-registers Tempo, Prometheus, and Loki at container start, so nobody has to configure them in the UI after each restart. It also wires cross-links between the three (trace to logs, trace to service graph, log to trace).

## Key elements
- **Tempo** (`uid: tempo`, `http://tempo:3200`, default datasource): trace queries.
  - `serviceMap.datasourceUid: prometheus` reads service-graph metrics from Prometheus.
  - `tracesToLogsV2` links to Loki (`datasourceUid: loki`), filtering by trace ID but not span ID. Its `tags` mapping turns the span attribute `service.name` into the Loki stream label `service`.
- **Prometheus** (`uid: prometheus`, `http://prometheus:9090`): metrics and alert rule visualization. Queries use GET.
- **Loki** (`uid: loki`, `http://loki:3100`): log search. A `derivedFields` entry named `TraceID` matches `"trace_id":"(\w+)"` in log lines and links to Tempo through `$${__value.raw}`.
- All three use `access: proxy`, so Grafana makes the requests server-side. Their URLs use Docker service hostnames.

## Relationships
- `tempo.config.yaml`, `prometheus.config.yaml`, and `loki.config.yaml` configure the backends this file points at. The hostnames and ports here (`tempo:3200`, `prometheus:9090`, `loki:3100`) must match those services.
- `grafana.dashboard-providers.yaml` is the sibling Grafana provisioning file. This file covers datasources and that one covers dashboards.

## Notes
- The datasource `uid` values (`tempo`, `prometheus`, `loki`) are what the cross-references use. Changing one breaks the links that point to it.
- Keep the `tracesToLogsV2.tags` mapping. Without it, Grafana falls back to its defaults and builds a query on `service_name`, which this stack never sets. The Loki panel then opens empty with no error.
- `service` is the label Alloy promotes from the `service` field Winston writes on every record. It is also the label Alloy attaches to frontend telemetry. One mapping therefore covers both halves of a stitched trace.
- The service-graph series read through `serviceMap` are derived by the collector's servicegraph connector, not by this file. This setting only selects which Prometheus to read them from.
- `trace_id` in the derived-field regex is the OpenTelemetry Logs Data Model name. The logger renames other fields but not this one.
- The `$$` in `$${__value.raw}` is an escape. Grafana's provisioning expands `$` as an environment variable, so a literal `$` must be written as `$$`.
