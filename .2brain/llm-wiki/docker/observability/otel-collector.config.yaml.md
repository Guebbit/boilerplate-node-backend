---
source: docker/observability/otel-collector.config.yaml
source_sha256: 8417770041ad23d91647de1f838b7eac45c04ee67701283c1e4eebff98cb0180
context_sha256: c590cbc006d6177fa034d9042c7909686d58ce9802e27729affe42c8a13c5724
generated_at: 2026-11-22T01:32:38.720171+00:00
model: claude-code:claude-sonnet-5-5
---

# docker/observability/otel-collector.config.yaml

## Purpose
Configuration for the OpenTelemetry Collector, which acts as the telemetry gateway between the app and the backends. It receives OTLP traces from the app, forwards them to Tempo, and also derives service-graph metrics from those spans so Prometheus can scrape them. It also exposes the collector's own internal metrics.

## Key elements
- **`receivers.otlp`**: OTLP ingest over HTTP on `0.0.0.0:4318` (the app's path) and gRPC on `0.0.0.0:4317`.
- **`processors.batch`**: batches spans before export to reduce chattiness and improve throughput.
- **`connectors.service_graph`**: pairs client and server spans to produce the `traces_service_graph_request_*` metrics. It has latency histogram buckets from 0.01 to 10 and a `store` with `ttl: 10s` and `max_items: 10000`. Spans that find no pair within the TTL are dropped.
- **`exporters.otlp_grpc/tempo`**: sends traces to `tempo:4317` with `tls.insecure: true`.
- **`exporters.prometheus`**: a pull endpoint on `0.0.0.0:8889` that serves the derived service-graph metrics.
- **`service.telemetry.metrics.readers`**: a pull reader that serves the collector's own metrics in Prometheus format on `0.0.0.0:8888`.
- **`service.pipelines.traces`**: `otlp` → `batch` → `[otlp_grpc/tempo, service_graph]`.
- **`service.pipelines.metrics/servicegraph`**: `service_graph` → `prometheus`, with no processors.

## Relationships
- **`tempo.config.yaml`**: Tempo is the trace store. The `otlp_grpc/tempo` exporter targets `tempo:4317` on the Docker network.
- **`prometheus.config.yaml`**: Prometheus scrapes two targets on this collector. The `otel-collector` job reads the internal telemetry on `:8888`. The `otel-collector-spanmetrics` job reads the derived service-graph metrics on `:8889`.

## Notes
- The `service.telemetry` block is required. Since collector v0.104 the default internal endpoint is `localhost:8888`, which is unreachable from the Prometheus container. Without the block, scrapes get connection refused and the target shows DOWN, while the collector keeps working.
- The `readers` / `pull` form is used because the `address:` shorthand was removed in 0.162.
- Ports 8888 (internal telemetry) and 8889 (derived metrics) are deliberately separate, so collector health and derived data are not a single target.
- Without the `service_graph` connector, the Grafana Service Graph tab renders empty and gives no sign that the metrics were never generated. The `serviceMap` setting in `grafana.datasources.yaml` relies on the `traces_service_graph_request_*` series this connector produces.
- Binding to `0.0.0.0` is acceptable because nothing in the compose stack is published outside the host.
- The `traces` pipeline sends every span to both Tempo and the connector. Tempo stores the spans, and the connector only counts them and discards them.
- The comment above `latency_histogram_buckets` says it sets where derived metrics are sent. That is misleading, because the key only sets histogram buckets. The derived metrics go through the `metrics/servicegraph` pipeline.
