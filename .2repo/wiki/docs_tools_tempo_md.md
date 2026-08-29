# docs/tools/tempo.md

## Purpose

Documents the role of Grafana Tempo as the trace store in this boilerplate's observability stack: the data flow (App → OTel Collector → Tempo → Grafana), the runtime configuration, and how to query traces. Exists so readers know Tempo is never queried directly and is always accessed through Grafana.

## Key elements

- **Data path** – App exports OTLP/HTTP to `otel-collector:4318`; collector forwards via internal gRPC to Tempo on `:4317`.
- **Runtime mode** – Single-binary Tempo with local filesystem storage, configured in `.docker/observability/tempo.config.yaml`.
- **Grafana integration** – Grafana auto-provisions Tempo as the default trace datasource (UI at `localhost:3001` → Explore → Tempo).
- **Query language** – TraceQL (beyond simple `trace_id` lookups).
- **Correlation keys** – Spans carry the same `trace_id` that Winston log lines carry in Loki, enabling trace↔log jumps in Grafana.

## Relationships

- **`docs/tools/analytics.md`** – No interaction is described in this file's content; no dependency or cross-reference to analytics is present.

## Notes

- Tempo has no standalone UI; all exploration is through Grafana.
- The app does **not** talk to Tempo directly—the OTel Collector is the mandatory intermediary.
- Search examples given: `service.name = "api"`, `trace_id`, HTTP route, error filter.
