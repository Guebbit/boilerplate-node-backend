---
source: docker/observability/grafana.datasources.yaml
sha256: a66dee6f7732cb0f8bbbb5eeceaa8c5dd6fe4b6061f1b7c81ea8691e28cb3bdd
generated_at: 2026-09-23T17:13:09.720959+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/grafana.datasources.yaml

## Purpose

Grafana datasource provisioning file that auto-registers Tempo, Prometheus, and Loki as data sources on every container start, eliminating manual UI configuration and ensuring trace → log → metric cross-linking works out of the box.

## Key elements

- **Tempo datasource** (`uid: tempo`, `isDefault: true`) — trace query endpoint at `http://tempo:3200`; configures `serviceMap` (reads service-graph series from Prometheus via the collector's servicegraph connector) and `tracesToLogsV2` (jumps from a trace span into Loki, filtered by trace ID, mapping the `service.name` span attribute to Loki's `service` stream label).
- **Prometheus datasource** (`uid: prometheus`) — metrics endpoint at `http://prometheus:9090`; consumed by Tempo's service-graph feature and for direct metric dashboards.
- **Loki datasource** (`uid: loki`) — log query endpoint at `http://loki:3100`; defines a `derivedFields` entry that turns `"trace_id":"(\w+)"` patterns in log lines into clickable Tempo trace links.

## Relationships

- **otel-collector.config.yaml** — its `servicegraph` connector produces the Prometheus series that Tempo's `serviceMap` reads; the datasource file only declares _which_ Prometheus holds them.
- **prometheus.config.yaml / tempo.config.yaml / loki.config.yaml** — these are the actual services the URLs in this file point to; they must be running and reachable by Docker-internal hostname for the datasources to resolve.
- **grafana.dashboard-providers.yaml** — sibling provisioning file in the same Grafana provisioning path; dashboards it loads reference the `uid` values defined here (`tempo`, `prometheus`, `loki`).

## Notes

- The `tags` entry in `tracesToLogsV2` is load-bearing. Omitting it does **not** mean "match everything": Grafana falls back to its own default labels (cluster, hostname, namespace, pod, `service.name`) and builds a query like `{service_name="api"}` against a Loki label this stack never sets, producing an empty panel with no error. The explicit mapping to the `service` label (the one Promtail promotes and Alloy attaches) is what makes the jump work for both backend and frontend spans.
- `uid` values are stable identifiers; renaming a datasource in the UI would break cross-datasource references (`datasourceUid` fields) in both this file and any dashboards.
- All URLs use Docker-internal hostnames (`tempo`, `prometheus`, `loki`), so this file is only valid inside the compose network, not from a browser on the host.
